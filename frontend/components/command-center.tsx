'use client'

import dynamic from 'next/dynamic'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentResult, EvaluationSummary, Incident } from '@/lib/contracts'

const ShaderGradientBackdrop = dynamic(
  () => import('./shader-gradient-backdrop').then((module) => module.ShaderGradientBackdrop),
  { ssr: false },
)
const AgentScene = dynamic(
  () => import('./agent-scene').then((module) => module.AgentScene),
  { ssr: false },
)

const presets: Array<{ label: string; incident: Incident }> = [
  {
    label: 'Checkout outage',
    incident: {
      incident_id: 'DEMO-1001',
      title: 'Checkout API timeouts after deployment',
      description: 'Production checkout requests are timing out for multiple users after a deployment.',
      service: 'checkout-api',
      environment: 'production',
      customer_impact: 'Multiple customers cannot complete checkout',
      recent_change: true,
      source: 'interactive-command-center',
      reporter: 'portfolio-demo',
    },
  },
  {
    label: 'Queue backlog',
    incident: {
      incident_id: 'DEMO-1002',
      title: 'Order queue backlog',
      description: 'Background workers are delayed and queue depth is increasing.',
      service: 'order-processing',
      environment: 'production',
      customer_impact: 'Orders are delayed',
      recent_change: false,
      source: 'interactive-command-center',
      reporter: 'portfolio-demo',
    },
  },
  {
    label: 'Database unavailable',
    incident: {
      incident_id: 'DEMO-1003',
      title: 'Database unavailable',
      description: 'Primary database is unavailable and all users are affected.',
      service: 'customer-db',
      environment: 'production',
      customer_impact: 'All users cannot access the service',
      recent_change: true,
      source: 'interactive-command-center',
      reporter: 'portfolio-demo',
    },
  },
  {
    label: 'Analytics retry',
    incident: {
      incident_id: 'DEMO-1004',
      title: 'Reporting refresh failed',
      description: 'Nightly analytics refresh failed once.',
      service: 'analytics',
      environment: 'staging',
      customer_impact: 'Internal dashboard data is stale',
      recent_change: false,
      source: 'interactive-command-center',
      reporter: 'portfolio-demo',
    },
  },
]

const emptyIncident: Incident = { ...presets[0].incident }

const agentLabels = [
  ['TriageAgent', 'Classify impact and SLA'],
  ['RunbookAgent', 'Ground on operating procedure'],
  ['RootCauseAgent', 'Generate bounded hypotheses'],
  ['ChangeRiskAgent', 'Apply deterministic policy'],
  ['ResolutionAgent', 'Select allowlisted action'],
  ['ToolExecutor', 'Execute governed tool call'],
  ['CommunicationsAgent', 'Produce stakeholder update'],
] as const

const statusCopy: Record<AgentResult['status'], string> = {
  WAITING_FOR_APPROVAL: 'Human decision required',
  ACTION_EXECUTED: 'Governed action completed',
  ACTION_BLOCKED: 'Action safely blocked',
}

type HistoryItem = {
  incident: Incident
  result: AgentResult
  timestamp: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isIncident(value: unknown): value is Incident {
  if (!isRecord(value)) return false
  return (
    typeof value.incident_id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.service === 'string' &&
    typeof value.environment === 'string' &&
    typeof value.customer_impact === 'string' &&
    typeof value.recent_change === 'boolean'
  )
}

function isAgentResult(value: unknown): value is AgentResult {
  if (!isRecord(value)) return false
  const severities = ['P1', 'P2', 'P3', 'P4']
  const statuses = ['WAITING_FOR_APPROVAL', 'ACTION_EXECUTED', 'ACTION_BLOCKED']
  return (
    typeof value.trace_id === 'string' &&
    severities.includes(String(value.severity)) &&
    statuses.includes(String(value.status)) &&
    typeof value.confidence === 'number' &&
    typeof value.sla_minutes === 'number' &&
    typeof value.runbook === 'string' &&
    typeof value.requires_approval === 'boolean' &&
    typeof value.auto_action === 'string' &&
    typeof value.stakeholder_message === 'string' &&
    typeof value.llm_mode === 'string' &&
    Array.isArray(value.evidence) &&
    Array.isArray(value.recommended_actions) &&
    Array.isArray(value.root_cause_hypotheses) &&
    Array.isArray(value.tool_executions) &&
    Array.isArray(value.agent_trace)
  )
}

function isHistoryItem(value: unknown): value is HistoryItem {
  if (!isRecord(value)) return false
  return typeof value.timestamp === 'string' && isIncident(value.incident) && isAgentResult(value.result)
}

function isEvaluationSummary(value: unknown): value is EvaluationSummary {
  if (!isRecord(value)) return false
  return (
    typeof value.cases === 'number' &&
    typeof value.severity_accuracy === 'number' &&
    typeof value.runbook_accuracy === 'number' &&
    typeof value.approval_gate_accuracy === 'number' &&
    Array.isArray(value.rows)
  )
}

function useHistory() {
  const [history, setHistory] = useState<HistoryItem[]>([])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('autonomousops-history')
      if (!stored) return
      const parsed = JSON.parse(stored) as unknown
      if (!Array.isArray(parsed)) return
      setHistory(parsed.filter(isHistoryItem).slice(0, 5))
    } catch {
      // Local history is optional and never blocks incident processing.
    }
  }, [])

  function push(item: HistoryItem) {
    setHistory((current) => {
      const next = [item, ...current].slice(0, 5)
      try {
        window.localStorage.setItem('autonomousops-history', JSON.stringify(next))
      } catch {
        // Ignore quota/private-mode storage failures.
      }
      return next
    })
  }

  return { history, push }
}

function Meter({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(1, value))
  return (
    <div className="meter" aria-label={`${Math.round(safe * 100)} percent`}>
      <span style={{ width: `${Math.round(safe * 100)}%` }} />
    </div>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  )
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.8a9.4 9.4 0 0 0-3 18.3c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 0 1.6 1 1.6 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.7-1.3-2.3-.3-4.7-1.1-4.7-5a3.9 3.9 0 0 1 1-2.7 3.6 3.6 0 0 1 .1-2.7s.9-.3 2.8 1a9.8 9.8 0 0 1 5.2 0c2-1.3 2.8-1 2.8-1a3.6 3.6 0 0 1 .1 2.7 3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.7 5 .4.3.7 1 .7 1.9v2.7c0 .3.2.6.7.5A9.4 9.4 0 0 0 12 2.8Z" />
    </svg>
  )
}

function AgentPipeline({ result, activeIndex, busy }: { result: AgentResult | null; activeIndex: number; busy: boolean }) {
  return (
    <ol className="agent-pipeline" aria-label="Agent workflow">
      {agentLabels.map(([agent, description], index) => {
        const step = result?.agent_trace.find((item) => item.agent === agent)
        const complete = Boolean(step) && !busy
        const active = busy && activeIndex === index
        return (
          <li key={agent} className={active ? 'is-active' : complete ? 'is-complete' : ''}>
            <span className="agent-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="agent-copy">
              <strong>{agent.replace('Agent', '')}</strong>
              <small>{step?.summary ?? description}</small>
            </span>
            <span className="agent-state">{active ? 'RUNNING' : complete ? step?.status : 'READY'}</span>
          </li>
        )
      })}
    </ol>
  )
}

export function CommandCenter() {
  const reduceMotion = Boolean(useReducedMotion())
  const [incident, setIncident] = useState<Incident>(emptyIncident)
  const [result, setResult] = useState<AgentResult | null>(null)
  const [evaluation, setEvaluation] = useState<EvaluationSummary | null>(null)
  const [evaluationFailed, setEvaluationFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const simulatorRef = useRef<HTMLElement>(null)
  const lastRunIncident = useRef<Incident | null>(null)
  const { history, push } = useHistory()

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/evaluation', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Evaluation endpoint failed')
        const value = await response.json() as unknown
        if (!isEvaluationSummary(value)) throw new Error('Evaluation response was invalid')
        return value
      })
      .then((value) => {
        setEvaluation(value)
        setEvaluationFailed(false)
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setEvaluation(null)
        setEvaluationFailed(true)
      })
    return () => controller.abort()
  }, [])

  const completedCount = busy ? Math.max(activeIndex, 0) : result ? agentLabels.length : 0

  const resultTone = useMemo(() => {
    if (!result) return 'neutral'
    if (result.status === 'ACTION_BLOCKED') return 'blocked'
    if (result.status === 'WAITING_FOR_APPROVAL') return 'warning'
    return 'success'
  }, [result])

  function invalidateResult() {
    if (busy) return
    setResult(null)
    lastRunIncident.current = null
    setError('')
    setCopied(false)
  }

  async function runIncident(decision?: 'approve' | 'reject') {
    if (busy) return
    if (decision && (result?.status !== 'WAITING_FOR_APPROVAL' || !lastRunIncident.current)) {
      setError('This approval is no longer attached to the current incident. Run triage again.')
      return
    }

    const submittedIncident = decision && lastRunIncident.current
      ? { ...lastRunIncident.current }
      : { ...incident }
    const original = result

    setBusy(true)
    setError('')
    setCopied(false)
    if (!decision) setResult(null)

    let ticker: ReturnType<typeof setInterval> | undefined
    if (!reduceMotion) {
      setActiveIndex(0)
      ticker = setInterval(() => {
        setActiveIndex((current) => Math.min(current + 1, agentLabels.length - 1))
      }, 155)
    } else {
      setActiveIndex(agentLabels.length - 1)
    }

    try {
      const response = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident: submittedIncident, ...(decision ? { decision } : {}) }),
      })
      const responseText = await response.text()
      let payload: unknown
      try {
        payload = JSON.parse(responseText)
      } catch {
        throw new Error('Incident service returned an invalid response.')
      }

      if (!response.ok) {
        const message = isRecord(payload) && typeof payload.error === 'string'
          ? payload.error
          : 'Incident processing failed'
        throw new Error(message)
      }
      if (!isAgentResult(payload)) throw new Error('Incident service returned an invalid result contract.')

      if (!reduceMotion) await new Promise((resolve) => setTimeout(resolve, 850))
      setResult(payload)
      lastRunIncident.current = submittedIncident
      push({ incident: submittedIncident, result: payload, timestamp: new Date().toISOString() })
    } catch (reason) {
      if (decision) setResult(original)
      setError(reason instanceof Error ? reason.message : 'Unable to process incident')
    } finally {
      if (ticker) clearInterval(ticker)
      setActiveIndex(-1)
      setBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void runIncident()
  }

  function choosePreset(preset: (typeof presets)[number]) {
    if (busy) return
    setIncident({ ...preset.incident, incident_id: `DEMO-${Date.now().toString().slice(-6)}` })
    invalidateResult()
  }

  async function copyUpdate() {
    if (!result) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(result.stakeholder_message)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = result.stakeholder_message
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        const copiedFallback = document.execCommand('copy')
        textarea.remove()
        if (!copiedFallback) throw new Error('Clipboard unavailable')
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
      setError('Copy failed. Select the stakeholder update manually.')
    }
  }

  function scrollToSimulator() {
    simulatorRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  function restoreHistory(item: HistoryItem) {
    if (busy) return
    setIncident({ ...item.incident })
    setResult(item.result)
    lastRunIncident.current = { ...item.incident }
    setError('')
    setCopied(false)
    scrollToSimulator()
  }

  return (
    <main className="site-shell">
      <header className="topbar glass-panel">
        <a href="#top" className="brand" aria-label="AutonomousOps home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>AutonomousOps</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#simulator">Simulator</a>
          <a href="#architecture">Architecture</a>
          <a href="#evaluation">Evaluation</a>
        </nav>
        <a
          className="icon-link"
          href="https://github.com/Samadritaacharya/autonomousops-incident-response-agent"
          target="_blank"
          rel="noreferrer"
          aria-label="View AutonomousOps source on GitHub"
        >
          <GithubIcon />
        </a>
      </header>

      <section className="hero" id="top">
        <ShaderGradientBackdrop reducedMotion={reduceMotion} />
        <div className="hero-grid" aria-hidden="true" />
        <motion.div
          className="hero-copy"
          initial={reduceMotion ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <p className="kicker"><span className="status-dot" /> EVENT-DRIVEN AGENTIC OPERATIONS</p>
          <h1>Incident response, under control.</h1>
          <p className="hero-lede">
            A working multi-agent command center that triages operational events, retrieves grounded runbooks,
            reasons about root causes, enforces approval gates and exposes every tool decision in one auditable flow.
          </p>
          <div className="hero-actions">
            <button className="button primary" onClick={scrollToSimulator}>
              Run incident simulation <ArrowIcon />
            </button>
            <a className="button secondary" href="#architecture">Explore the agent graph</a>
          </div>
          <p className="free-note">No paid API required. No login. No database. Portfolio-safe actions only.</p>
        </motion.div>

        <motion.div
          className="hero-console glass-panel"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: 34 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="console-topline">
            <span><i className="live-light" /> orchestration.live</span>
            <code>deterministic-policy</code>
          </div>
          <div className="hero-scene">
            <AgentScene
              activeIndex={busy ? activeIndex : -1}
              completed={busy ? completedCount : result ? agentLabels.length : 0}
              severity={result?.severity}
              reducedMotion={reduceMotion}
            />
          </div>
          <div className="console-footer">
            <div><span>Agents</span><strong>7</strong></div>
            <div><span>Governance</span><strong>ENFORCED</strong></div>
            <div><span>Mutations</span><strong>SIMULATED</strong></div>
          </div>
        </motion.div>
      </section>

      <section className="proof-strip" aria-label="System capabilities">
        <div><strong>EVENT</strong><span>GitHub / API / UI</span></div>
        <div><strong>GROUND</strong><span>Repository runbooks</span></div>
        <div><strong>GOVERN</strong><span>Deterministic policy</span></div>
        <div><strong>ACT</strong><span>Allowlisted tools</span></div>
        <div><strong>AUDIT</strong><span>Trace every agent</span></div>
      </section>

      <section className="bento-section section-wrap" aria-labelledby="capability-title">
        <div className="section-heading">
          <p className="kicker">DESIGNED FOR EXPLAINABLE AUTONOMY</p>
          <h2 id="capability-title">The system shows its work.</h2>
          <p>High-quality incident automation is not just a fast answer. It is bounded reasoning, explicit evidence and observable execution.</p>
        </div>
        <div className="bento-grid">
          <article className="bento-card bento-large glass-panel">
            <span className="card-index">01</span>
            <div>
              <h3>Governance before mutation</h3>
              <p>P1 and P2 incidents stop at a human approval boundary before any write-capable remediation can run.</p>
            </div>
            <div className="policy-visual">
              <div className="policy-line"><span>diagnostics.read</span><b>ALLOW</b></div>
              <div className="policy-line"><span>worker.scale</span><b className="warn">APPROVAL</b></div>
              <div className="policy-line"><span>unknown.action</span><b className="block">BLOCK</b></div>
            </div>
          </article>
          <article className="bento-card glass-panel">
            <span className="card-index">02</span>
            <h3>Grounded retrieval</h3>
            <p>The resolution plan is constrained by checked-in service runbooks instead of invented operational steps.</p>
            <div className="mini-code"><code>checkout-api → api-latency.md</code><code>customer-db → database.md</code></div>
          </article>
          <article className="bento-card glass-panel">
            <span className="card-index">03</span>
            <h3>Tool-level evidence</h3>
            <p>Every run exposes diagnostic calls, approval requests and simulated remediation results with trace IDs.</p>
            <div className="trace-spark" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          </article>
          <article className="bento-card bento-wide glass-panel">
            <span className="card-index">04</span>
            <div>
              <h3>Measured, not marketed</h3>
              <p>The same deterministic engine used by this web demo is evaluated against eight checked-in synthetic incidents.</p>
            </div>
            <div className="metric-row">
              <div><strong>{evaluation ? `${Math.round(evaluation.severity_accuracy * 100)}%` : '—'}</strong><span>severity</span></div>
              <div><strong>{evaluation ? `${Math.round(evaluation.runbook_accuracy * 100)}%` : '—'}</strong><span>runbook</span></div>
              <div><strong>{evaluation ? `${Math.round(evaluation.approval_gate_accuracy * 100)}%` : '—'}</strong><span>approval gate</span></div>
            </div>
          </article>
        </div>
      </section>

      <section className="simulator section-wrap" id="simulator" ref={simulatorRef} aria-labelledby="simulator-title">
        <div className="section-heading split-heading">
          <div>
            <p className="kicker">LIVE INCIDENT LAB</p>
            <h2 id="simulator-title">Drive the whole agent chain.</h2>
          </div>
          <p>Choose a scenario or edit every input. The browser calls a real server route, executes the deterministic orchestration contract and returns the complete trace.</p>
        </div>

        <div className="simulator-layout">
          <form className="incident-form glass-panel" onSubmit={submit} onChangeCapture={invalidateResult} aria-busy={busy}>
            <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'contents' }}>
              <div className="preset-row" aria-label="Incident presets">
                {presets.map((preset) => (
                  <button type="button" key={preset.label} onClick={() => choosePreset(preset)}>{preset.label}</button>
                ))}
              </div>
              <label>
                <span>Incident title</span>
                <input
                  value={incident.title}
                  maxLength={240}
                  onChange={(event) => setIncident({ ...incident, title: event.target.value })}
                  required
                />
              </label>
              <div className="form-row">
                <label>
                  <span>Service</span>
                  <select value={incident.service} onChange={(event) => setIncident({ ...incident, service: event.target.value })}>
                    <option value="checkout-api">checkout-api</option>
                    <option value="order-processing">order-processing</option>
                    <option value="customer-db">customer-db</option>
                    <option value="analytics">analytics</option>
                    <option value="unknown-service">unknown-service</option>
                  </select>
                </label>
                <label>
                  <span>Environment</span>
                  <select value={incident.environment} onChange={(event) => setIncident({ ...incident, environment: event.target.value })}>
                    <option value="production">production</option>
                    <option value="staging">staging</option>
                    <option value="development">development</option>
                  </select>
                </label>
              </div>
              <label>
                <span>What happened</span>
                <textarea
                  rows={4}
                  value={incident.description}
                  maxLength={6000}
                  onChange={(event) => setIncident({ ...incident, description: event.target.value })}
                  required
                />
              </label>
              <label>
                <span>Customer impact</span>
                <textarea
                  rows={3}
                  value={incident.customer_impact}
                  maxLength={2000}
                  onChange={(event) => setIncident({ ...incident, customer_impact: event.target.value })}
                  required
                />
              </label>
              <label className="toggle-line">
                <input
                  type="checkbox"
                  checked={incident.recent_change}
                  onChange={(event) => setIncident({ ...incident, recent_change: event.target.checked })}
                />
                <span className="toggle-track"><i /></span>
                <span>Recent change or deployment detected</span>
              </label>
            </fieldset>
            <button className="button primary full" type="submit" disabled={busy}>
              {busy ? 'Orchestrating incident…' : 'Start autonomous triage'}
              {!busy && <ArrowIcon />}
            </button>
            {error && <p className="form-error" role="alert">{error}</p>}
          </form>

          <div className="run-panel glass-panel" data-tone={resultTone}>
            <div className="run-panel-head">
              <div>
                <p className="kicker">ORCHESTRATION TRACE</p>
                <h3>{result ? statusCopy[result.status] : busy ? 'Agents are working' : 'Ready for an incident'}</h3>
              </div>
              <div className="trace-id">{result?.trace_id ?? 'TRC-PENDING'}</div>
            </div>

            <div className="run-scene">
              <AgentScene
                activeIndex={activeIndex}
                completed={completedCount}
                severity={result?.severity}
                reducedMotion={reduceMotion}
              />
              {result && (
                <div className={`severity-badge ${result.severity.toLowerCase()}`}>
                  <strong>{result.severity}</strong><span>{result.sla_minutes} min SLA</span>
                </div>
              )}
            </div>

            <AgentPipeline result={result} activeIndex={activeIndex} busy={busy} />

            <AnimatePresence mode="wait">
              {result && !busy && (
                <motion.div
                  key={`${result.trace_id}-${result.status}`}
                  className="result-stack"
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="result-summary">
                    <div><span>Runbook</span><strong>{result.runbook}</strong></div>
                    <div><span>Confidence</span><strong>{Math.round(result.confidence * 100)}%</strong></div>
                    <div><span>Reasoning</span><strong>{result.llm_mode}</strong></div>
                  </div>
                  <div className="hypothesis-box">
                    <span>Root-cause hypotheses</span>
                    <ul>{result.root_cause_hypotheses.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                  </div>
                  <div className="tool-trace">
                    {result.tool_executions.map((tool, index) => (
                      <div key={`${tool.tool}-${index}`}>
                        <span className={`tool-state ${tool.status.toLowerCase()}`}>{tool.status}</span>
                        <strong>{tool.tool}</strong>
                        <p>{tool.message}</p>
                      </div>
                    ))}
                  </div>
                  {result.status === 'WAITING_FOR_APPROVAL' && (
                    <div className="approval-box">
                      <div><span>Approval ID</span><code>{result.approval_id ?? 'PENDING'}</code></div>
                      <p>The agent stopped before the proposed write-capable action. Choose the operator decision.</p>
                      <div className="approval-actions">
                        <button className="button primary" onClick={() => void runIncident('approve')} disabled={busy}>Approve safe simulation</button>
                        <button className="button danger" onClick={() => void runIncident('reject')} disabled={busy}>Reject remediation</button>
                      </div>
                    </div>
                  )}
                  <div className="stakeholder-box">
                    <div><span>Stakeholder update</span><button type="button" onClick={() => void copyUpdate()}>{copied ? 'Copied' : 'Copy'}</button></div>
                    <p>{result.stakeholder_message}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      <section className="architecture section-wrap" id="architecture" aria-labelledby="architecture-title">
        <div className="architecture-copy">
          <p className="kicker">SEVEN SPECIALISTS, ONE GOVERNED FLOW</p>
          <h2 id="architecture-title">Reasoning stays flexible. Authority stays deterministic.</h2>
          <p>
            The root-cause layer can be upgraded to a generative model, but the permission boundary remains code-driven.
            That separation prevents a probabilistic model from authorizing its own production-impacting action.
          </p>
          <div className="architecture-principles">
            <div><span>01</span><p><strong>Evidence first.</strong> Triage and retrieval attach inspectable evidence to the trace.</p></div>
            <div><span>02</span><p><strong>Policy owns authority.</strong> Severity and environment decide whether approval is mandatory.</p></div>
            <div><span>03</span><p><strong>Tools stay allowlisted.</strong> Unknown mutations are blocked; public demo mutations are simulated.</p></div>
          </div>
        </div>
        <div className="architecture-visual glass-panel">
          <AgentScene activeIndex={3} completed={3} severity="P2" reducedMotion={reduceMotion} />
          <div className="architecture-ring-labels" aria-hidden="true">
            <span>Triage</span><span>Runbook</span><span>Root Cause</span><span>Risk</span><span>Resolution</span><span>Tools</span><span>Comms</span>
          </div>
        </div>
      </section>

      <section className="evaluation section-wrap" id="evaluation" aria-labelledby="evaluation-title">
        <div className="section-heading split-heading">
          <div>
            <p className="kicker">REPRODUCIBLE EVALUATION</p>
            <h2 id="evaluation-title">Metrics that come from tests.</h2>
          </div>
          <p>The command center does not hard-code portfolio claims. It computes the baseline from the same eight synthetic cases that validate the Python implementation.</p>
        </div>
        <div className="evaluation-grid">
          <div className="evaluation-metrics glass-panel">
            {[
              ['Severity accuracy', evaluation?.severity_accuracy],
              ['Runbook accuracy', evaluation?.runbook_accuracy],
              ['Approval-gate accuracy', evaluation?.approval_gate_accuracy],
            ].map(([label, value]) => (
              <div className="evaluation-metric" key={label as string}>
                <div><span>{label as string}</span><strong>{typeof value === 'number' ? `${Math.round(value * 100)}%` : '—'}</strong></div>
                <Meter value={typeof value === 'number' ? value : 0} />
              </div>
            ))}
            <p>
              {evaluation
                ? `${evaluation.cases} synthetic incidents evaluated on every CI run.`
                : evaluationFailed
                  ? 'Evaluation endpoint is temporarily unavailable; core incident processing remains functional.'
                  : 'Loading evaluation from the server route…'}
            </p>
          </div>
          <div className="evaluation-table-wrap glass-panel">
            <table>
              <thead><tr><th>Incident</th><th>Severity</th><th>Runbook</th><th>Gate</th></tr></thead>
              <tbody>
                {evaluation?.rows.map((row) => (
                  <tr key={row.incident_id}>
                    <td>{row.incident_id}</td>
                    <td><span className="pass-dot" />{row.severity}</td>
                    <td>{row.runbook.replace('.md', '')}</td>
                    <td>{row.approval ? 'approval' : 'auto'}</td>
                  </tr>
                )) ?? <tr><td colSpan={4}>{evaluationFailed ? 'Evaluation unavailable' : 'Loading evaluation…'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {history.length > 0 && (
        <section className="history section-wrap" aria-labelledby="history-title">
          <div className="section-heading"><p className="kicker">LOCAL SESSION HISTORY</p><h2 id="history-title">Your last five runs stay on this device.</h2></div>
          <div className="history-row">
            {history.map((item) => (
              <button
                key={`${item.result.trace_id}-${item.timestamp}`}
                className="history-card glass-panel"
                onClick={() => restoreHistory(item)}
              >
                <span>{item.result.severity} · {item.result.status.replaceAll('_', ' ')}</span>
                <strong>{item.incident.title}</strong>
                <small>{item.result.trace_id}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="closing-cta section-wrap">
        <div className="closing-orb" aria-hidden="true" />
        <p className="kicker">OPEN SOURCE · ZERO REQUIRED PAID SERVICES</p>
        <h2>Inspect every decision. Run every test. Own the whole stack.</h2>
        <div className="hero-actions">
          <a className="button primary" href="https://github.com/Samadritaacharya/autonomousops-incident-response-agent" target="_blank" rel="noreferrer">View source <GithubIcon /></a>
          <button className="button secondary" onClick={scrollToSimulator}>Run another incident</button>
        </div>
      </section>

      <footer>
        <a href="#top" className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>AutonomousOps</span></a>
        <p>Portfolio-safe multi-agent incident response. All infrastructure mutations in this public demo are simulated.</p>
        <span>Built for inspectability, governance and reproducibility.</span>
      </footer>
    </main>
  )
}
