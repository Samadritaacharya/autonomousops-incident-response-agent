import { randomUUID } from 'node:crypto'
import type {
  AgentResult,
  AgentStep,
  EvaluationSummary,
  Incident,
  Severity,
  ToolExecution,
  WorkflowStatus,
} from './contracts.ts'
import { evaluationCases } from './evaluation-fixtures.ts'

export const SEVERITY_SLA: Record<Severity, number> = {
  P1: 15,
  P2: 30,
  P3: 120,
  P4: 480,
}

type Runbook = { name: string; document: string; steps: string[] }

const runbooks: Record<string, Runbook> = {
  'checkout-api': {
    name: 'api-latency.md',
    document:
      'API latency timeout runbook for API timeouts, latency spikes, exhausted workers, dependency degradation, error rate and resource saturation.',
    steps: [
      'Collect diagnostics and recent logs',
      'Check API p95 latency, error rate, CPU and memory saturation',
      'Check recent deployment/change history',
      'Scale worker pool if saturation is confirmed',
      'Retry failed job only when idempotency is confirmed',
      'Escalate to dependency owner if upstream health is degraded',
    ],
  },
  'order-processing': {
    name: 'order-processing.md',
    document:
      'Order processing queue backlog runbook for failed orders, asynchronous processing delays, queue depth, backlog and worker failures.',
    steps: [
      'Collect diagnostics and recent logs',
      'Inspect queue depth and oldest-message age',
      'Check recent deployment/change history',
      'Clear stale queue only when duplicate-processing protection is enabled',
      'Scale worker capacity when backlog is increasing',
      'Reprocess failed orders after validating idempotency',
    ],
  },
  'customer-db': {
    name: 'database.md',
    document:
      'Database incident runbook for connection saturation, slow queries, read write failures, locks, active sessions and database unavailability.',
    steps: [
      'Collect diagnostics and recent logs',
      'Check connection pool saturation and active sessions',
      'Check recent deployment/change history',
      'Identify long-running queries and lock contention',
      'Fail over only with explicit human approval',
      'Escalate to database owner for suspected data-loss conditions',
    ],
  },
  analytics: {
    name: 'generic-incident.md',
    document:
      'Generic incident runbook when no service-specific runbook matches. Validate service health, dependencies, customer impact, scope and ownership.',
    steps: [
      'Collect diagnostics and recent logs',
      'Validate service health and dependencies',
      'Check recent deployment/change history',
      'Confirm customer impact and affected scope',
      'Assign the correct service owner',
      'Escalate when impact or uncertainty increases',
    ],
  },
}

const genericRunbook = runbooks.analytics
const highSignals = [
  'outage',
  'unavailable',
  'all users',
  'production down',
  'payment failure',
  'data loss',
  'security breach',
  'cannot checkout',
  'cannot complete checkout',
]
const mediumSignals = [
  'degraded',
  'timeout',
  'latency',
  'multiple users',
  'failed jobs',
  'queue backlog',
  'queue depth',
  'worker processing',
  'delayed',
  'errors',
  'connection failures',
]
const safeActions = ['refresh cache', 'retry failed job', 'scale worker', 'clear stale queue']

function code(prefix: string, size = 10) {
  return `${prefix}-${randomUUID().replaceAll('-', '').slice(0, size).toUpperCase()}`
}

function signalPresent(text: string, term: string) {
  if (!text.includes(term)) return false
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const negated = new RegExp(`\\b(?:no|not|without|never)\\s+(?:\\w+\\s+){0,2}${escaped}\\b`, 'i')
  return !negated.test(text)
}

function tokenize(text: string) {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? []
}

function cosineRetrievalScore(queryText: string, documentText: string, corpus: string[]) {
  const documentTokens = corpus.map((text) => tokenize(text))
  const documentFrequency = new Map<string, number>()
  for (const tokens of documentTokens) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
    }
  }

  const count = corpus.length
  const unknownIdf = Math.log((1 + count) / 1) + 1
  const vector = (tokens: string[]) => {
    const counts = new Map<string, number>()
    for (const term of tokens) counts.set(term, (counts.get(term) ?? 0) + 1)
    const output = new Map<string, number>()
    for (const [term, occurrences] of counts) {
      const idf = Math.log((1 + count) / (1 + (documentFrequency.get(term) ?? 0))) + 1
      output.set(term, (1 + Math.log(occurrences)) * (documentFrequency.has(term) ? idf : unknownIdf))
    }
    return output
  }

  const left = vector(tokenize(queryText))
  const right = vector(tokenize(documentText))
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (const weight of left.values()) leftNorm += weight * weight
  for (const weight of right.values()) rightNorm += weight * weight
  for (const [term, weight] of left) dot += weight * (right.get(term) ?? 0)
  return leftNorm && rightNorm ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) : 0
}

function classify(incident: Incident): { severity: Severity; confidence: number; evidence: string[] } {
  const text = `${incident.title} ${incident.description} ${incident.customer_impact}`.toLowerCase()
  const evidence: string[] = []
  let score = 0

  for (const term of highSignals) {
    if (signalPresent(text, term)) {
      score += 3
      evidence.push(`High-impact signal: '${term}'`)
    }
  }
  for (const term of mediumSignals) {
    if (signalPresent(text, term)) {
      score += 1
      evidence.push(`Degradation signal: '${term}'`)
    }
  }
  if (incident.environment.toLowerCase() === 'production') {
    score += 1
    evidence.push('Production environment')
  }
  if (incident.recent_change) {
    score += 1
    evidence.push('Recent change/deployment detected')
  }

  if (evidence.length === 0) evidence.push('No critical impact keywords detected')
  if (score >= 7) return { severity: 'P1', confidence: 0.94, evidence }
  if (score >= 4) return { severity: 'P2', confidence: 0.89, evidence }
  if (score >= 2) return { severity: 'P3', confidence: 0.82, evidence }
  return { severity: 'P4', confidence: 0.76, evidence }
}

function selectRunbook(incident: Incident) {
  const unique = Array.from(new Map(Object.values(runbooks).map((item) => [item.name, item])).values())
  const corpus = unique.map((item) => `${item.document} ${item.steps.join(' ')}`)
  const query = `${incident.service} ${incident.title} ${incident.description}`
  const preferred = runbooks[incident.service]?.name

  let best = genericRunbook
  let bestScore = -1
  for (const item of unique) {
    const document = `${item.document} ${item.steps.join(' ')}`
    let score = cosineRetrievalScore(query, document, corpus)
    if (item.name === preferred) score += 0.35
    if (score > bestScore) {
      best = item
      bestScore = score
    }
  }

  if (!preferred && bestScore < 0.08) best = genericRunbook
  return { ...best, score: Math.max(bestScore, 0) }
}

function hypotheses(incident: Incident): string[] {
  const items: string[] = []
  if (incident.recent_change) {
    items.push('A recent deployment or configuration change may correlate with the incident.')
  }
  const serviceHypothesis: Record<string, string> = {
    'checkout-api': 'API resource saturation or an unhealthy upstream dependency may be increasing latency.',
    'order-processing': 'Worker capacity, queue growth or a failing downstream dependency may be delaying orders.',
    'customer-db': 'Database connection saturation, locks or availability degradation may be blocking requests.',
    analytics: 'A scheduled job, dependency or transient data-refresh failure may have interrupted processing.',
  }
  if (serviceHypothesis[incident.service]) items.push(serviceHypothesis[incident.service])
  if (items.length === 0) {
    items.push('Insufficient evidence for a specific root cause; collect diagnostics before remediation.')
  }
  return items.slice(0, 3)
}

function riskPolicy(incident: Incident, severity: Severity) {
  if (severity === 'P1' || severity === 'P2') {
    return {
      requiresApproval: true,
      reason: 'High-severity incident: human approval required before mutating remediation.',
    }
  }
  if (incident.recent_change && incident.environment.toLowerCase() === 'production') {
    return {
      requiresApproval: true,
      reason: 'Recent production change detected: operator validation is required before remediation.',
    }
  }
  return {
    requiresApproval: false,
    reason: 'Low-risk scenario: allowlisted remediation may run after diagnostics.',
  }
}

function resolution(steps: string[]) {
  const candidates = steps.filter((item) => safeActions.some((safe) => item.toLowerCase().includes(safe)))
  return candidates[0] ?? 'Collect diagnostics'
}

function diagnostic(incident: Incident): ToolExecution {
  const signal: Record<string, string> = {
    'checkout-api': 'p95 latency elevated; 5xx rate elevated',
    'order-processing': 'queue depth elevated; oldest message age increasing',
    'customer-db': 'connection failures detected; saturation suspected',
    analytics: 'scheduled refresh failed; upstream data available',
  }
  return {
    tool: 'collect diagnostics',
    status: 'SUCCEEDED',
    message: signal[incident.service] ?? 'service health signals collected',
    simulated: true,
  }
}

function execute(action: string, incident: Incident, approved: boolean): ToolExecution {
  const normalized = action.toLowerCase().trim()
  const safe = safeActions.find((item) => normalized.includes(item))
  if (safe) {
    if (approved || incident.environment.toLowerCase() !== 'production') {
      return {
        tool: safe,
        status: 'SUCCEEDED',
        message: 'Portfolio-safe remediation simulation completed; no real system was changed.',
        simulated: true,
      }
    }
    return {
      tool: safe,
      status: 'BLOCKED',
      message: 'Production mutation blocked because explicit approval was not provided.',
      simulated: true,
    }
  }
  if (normalized.includes('collect diagnostics')) {
    return {
      tool: 'collect diagnostics',
      status: 'SUCCEEDED',
      message: 'Read-only diagnostic tool executed.',
      simulated: true,
    }
  }
  return {
    tool: normalized || 'unknown action',
    status: 'BLOCKED',
    message: 'Action is not in the allowlist and was not executed.',
    simulated: true,
  }
}

function step(
  agent: string,
  status: 'SUCCEEDED' | 'BLOCKED',
  summary: string,
  evidence: string[],
  duration: number,
): AgentStep {
  return { agent, status, summary, evidence, duration_ms: duration }
}

export function processIncident(incident: Incident, approvalGranted = false, approvalRejected = false): AgentResult {
  const triage = classify(incident)
  const runbook = selectRunbook(incident)
  const rootCauses = hypotheses(incident)
  const risk = riskPolicy(incident, triage.severity)
  const proposedAction = resolution(runbook.steps)
  const tools: ToolExecution[] = [diagnostic(incident)]
  let status: WorkflowStatus
  let approvalId: string | null = null

  if (approvalRejected) {
    tools.push({
      tool: 'human approval',
      status: 'BLOCKED',
      message: `Operator rejected remediation '${proposedAction}' on ${incident.service}.`,
      simulated: true,
    })
    status = 'ACTION_BLOCKED'
  } else if (risk.requiresApproval && !approvalGranted) {
    approvalId = code('APR', 8)
    tools.push({
      tool: 'request human approval',
      status: 'PENDING',
      message: `Approval requested for '${proposedAction}' on ${incident.service}.`,
      simulated: true,
    })
    status = 'WAITING_FOR_APPROVAL'
  } else {
    const execution = execute(proposedAction, incident, approvalGranted || !risk.requiresApproval)
    tools.push(execution)
    status = execution.status === 'SUCCEEDED' ? 'ACTION_EXECUTED' : 'ACTION_BLOCKED'
  }

  const trace: AgentStep[] = [
    step('TriageAgent', 'SUCCEEDED', `Classified ${triage.severity}`, triage.evidence, 7),
    step(
      'RunbookAgent',
      'SUCCEEDED',
      `Selected ${runbook.name} (retrieval score ${runbook.score.toFixed(2)})`,
      [`Grounded on ${runbook.steps.length} runbook steps`, 'Local TF-IDF cosine retrieval; no external embedding API required'],
      5,
    ),
    step('RootCauseAgent', 'SUCCEEDED', 'Generated bounded root-cause hypotheses', rootCauses, 11),
    step(
      'ChangeRiskAgent',
      'SUCCEEDED',
      risk.requiresApproval ? 'Approval required' : 'Low-risk automation allowed',
      [risk.reason],
      3,
    ),
    step(
      'ResolutionAgent',
      'SUCCEEDED',
      `Proposed: ${proposedAction}`,
      ['Action selected from grounded runbook and allowlist'],
      4,
    ),
    step(
      'ToolExecutor',
      status === 'ACTION_BLOCKED' ? 'BLOCKED' : 'SUCCEEDED',
      status,
      tools.map((tool) => `${tool.tool}: ${tool.status}`),
      2,
    ),
    step('CommunicationsAgent', 'SUCCEEDED', 'Generated stakeholder update', [], 4),
  ]

  const gate = approvalRejected
    ? 'Human approval rejected'
    : risk.requiresApproval && status === 'WAITING_FOR_APPROVAL'
      ? 'Human approval requested'
      : 'Governance checks passed'

  return {
    severity: triage.severity,
    confidence: triage.confidence,
    sla_minutes: SEVERITY_SLA[triage.severity],
    runbook: runbook.name,
    evidence: [...triage.evidence, risk.reason],
    recommended_actions: runbook.steps,
    requires_approval: risk.requiresApproval,
    auto_action: proposedAction,
    stakeholder_message: `[${triage.severity}] ${incident.service}: ${incident.title}. ${gate}. Workflow status: ${status}. Next action: ${proposedAction}. Customer impact: ${incident.customer_impact}.`,
    status,
    trace_id: code('TRC'),
    root_cause_hypotheses: rootCauses,
    tool_executions: tools,
    agent_trace: trace,
    llm_mode: 'deterministic-fallback',
    approval_id: approvalId,
  }
}

export function evaluateEngine(): EvaluationSummary {
  const rows = evaluationCases.map((testCase) => {
    const result = processIncident(testCase, false)
    return {
      incident_id: testCase.incident_id,
      severity: result.severity,
      expected_severity: testCase.expected_severity,
      severity_ok: result.severity === testCase.expected_severity,
      runbook: result.runbook,
      expected_runbook: testCase.expected_runbook,
      runbook_ok: result.runbook === testCase.expected_runbook,
      approval: result.requires_approval,
      expected_approval: testCase.expected_approval,
      approval_ok: result.requires_approval === testCase.expected_approval,
      status: result.status,
    }
  })
  const ratio = (key: 'severity_ok' | 'runbook_ok' | 'approval_ok') =>
    rows.filter((row) => row[key]).length / rows.length

  return {
    cases: rows.length,
    severity_accuracy: ratio('severity_ok'),
    runbook_accuracy: ratio('runbook_ok'),
    approval_gate_accuracy: ratio('approval_ok'),
    rows,
  }
}
