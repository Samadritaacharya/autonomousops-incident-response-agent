import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateEngine, processIncident } from '../lib/agent-engine.ts'
import { evaluationCases } from '../lib/evaluation-fixtures.ts'
import type { Incident } from '../lib/contracts.ts'

for (const fixture of evaluationCases) {
  test(`${fixture.incident_id} matches the Python evaluation contract`, () => {
    const result = processIncident(fixture)
    assert.equal(result.severity, fixture.expected_severity)
    assert.equal(result.runbook, fixture.expected_runbook)
    assert.equal(result.requires_approval, fixture.expected_approval)
    assert.equal(result.llm_mode, 'deterministic-fallback')
    assert.equal(result.agent_trace.length, 7)
    assert.equal(result.tool_executions[0]?.tool, 'collect diagnostics')
    assert.ok(result.tool_executions.every((tool) => tool.simulated))
  })
}

test('high-risk incidents pause and resume only after explicit approval', () => {
  const incident = evaluationCases[0]
  const waiting = processIncident(incident, false)
  assert.equal(waiting.status, 'WAITING_FOR_APPROVAL')
  assert.ok(waiting.approval_id?.startsWith('APR-'))
  assert.equal(waiting.tool_executions.at(-1)?.status, 'PENDING')

  const approved = processIncident(incident, true)
  assert.equal(approved.status, 'ACTION_EXECUTED')
  assert.equal(approved.approval_id, null)
  assert.equal(approved.tool_executions.at(-1)?.status, 'SUCCEEDED')
})

test('an explicit rejection blocks remediation and is visible in stakeholder communication', () => {
  const incident = evaluationCases[0]
  const rejected = processIncident(incident, false, true)
  assert.equal(rejected.status, 'ACTION_BLOCKED')
  assert.equal(rejected.approval_id, null)
  assert.equal(rejected.tool_executions.at(-1)?.status, 'BLOCKED')
  assert.match(rejected.tool_executions.at(-1)?.message ?? '', /rejected remediation/i)
  assert.match(rejected.stakeholder_message, /human approval rejected/i)
})

test('operator rejection is fail-closed even for a low-risk incident', () => {
  const incident = evaluationCases[6]
  const rejected = processIncident(incident, false, true)
  assert.equal(rejected.requires_approval, false)
  assert.equal(rejected.status, 'ACTION_BLOCKED')
  assert.equal(rejected.tool_executions.at(-1)?.tool, 'human approval')
})

test('recent production changes require approval even when severity is only P3', () => {
  const incident: Incident = {
    incident_id: 'EDGE-CHANGE',
    title: 'Routine service check',
    description: 'A routine service check is running after configuration work.',
    service: 'unknown-service',
    environment: 'production',
    customer_impact: 'No customer impact reported',
    recent_change: true,
  }
  const result = processIncident(incident)
  assert.equal(result.severity, 'P3')
  assert.equal(result.requires_approval, true)
  assert.equal(result.status, 'WAITING_FOR_APPROVAL')
  assert.match(result.evidence.at(-1) ?? '', /recent production change/i)
})

test('unknown services fall back to generic grounding when text has no service hints', () => {
  const incident: Incident = {
    incident_id: 'EDGE-GENERIC',
    title: 'Scheduled task notice',
    description: 'A background task needs inspection.',
    service: 'unknown-service',
    environment: 'development',
    customer_impact: 'No customer impact',
    recent_change: false,
  }
  const result = processIncident(incident)
  assert.equal(result.runbook, 'generic-incident.md')
  assert.equal(result.requires_approval, false)
  assert.equal(result.status, 'ACTION_EXECUTED')
  assert.equal(result.tool_executions.at(-1)?.tool, 'collect diagnostics')
})

test('unknown services can still retrieve a matching runbook from incident text', () => {
  const incident: Incident = {
    incident_id: 'EDGE-QUEUE',
    title: 'Queue backlog',
    description: 'Worker queue depth is increasing.',
    service: 'custom-worker',
    environment: 'staging',
    customer_impact: 'Internal processing delayed',
    recent_change: false,
  }
  const result = processIncident(incident)
  assert.equal(result.runbook, 'order-processing.md')
})

test('plural timeouts do not double-count the same timeout signal', () => {
  const incident: Incident = {
    incident_id: 'EDGE-TIMEOUT',
    title: 'API timeouts',
    description: 'A few API timeouts were observed.',
    service: 'checkout-api',
    environment: 'development',
    customer_impact: 'No customer impact',
    recent_change: false,
  }
  const result = processIncident(incident)
  const timeoutEvidence = result.evidence.filter((item) => item.includes("Degradation signal: 'timeout'"))
  assert.equal(timeoutEvidence.length, 1)
  assert.equal(result.evidence.some((item) => item.includes("'timeouts'")), false)
})

test('trace and approval identifiers have stable formats and fresh trace IDs', () => {
  const first = processIncident(evaluationCases[0])
  const second = processIncident(evaluationCases[0])
  assert.match(first.trace_id, /^TRC-[A-F0-9]{10}$/)
  assert.match(first.approval_id ?? '', /^APR-[A-F0-9]{8}$/)
  assert.notEqual(first.trace_id, second.trace_id)
})

test('evaluation remains reproducible at the checked-in baseline', () => {
  const summary = evaluateEngine()
  assert.equal(summary.cases, 8)
  assert.equal(summary.severity_accuracy, 1)
  assert.equal(summary.runbook_accuracy, 1)
  assert.equal(summary.approval_gate_accuracy, 1)
  assert.ok(summary.rows.every((row) => row.severity_ok && row.runbook_ok && row.approval_ok))
})
