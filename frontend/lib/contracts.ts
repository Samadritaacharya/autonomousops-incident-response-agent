export type Severity = 'P1' | 'P2' | 'P3' | 'P4'
export type WorkflowStatus = 'WAITING_FOR_APPROVAL' | 'ACTION_EXECUTED' | 'ACTION_BLOCKED'

export type Incident = {
  incident_id: string
  title: string
  description: string
  service: string
  environment: string
  customer_impact: string
  recent_change: boolean
  source?: string
  reporter?: string
}

export type AgentStep = {
  agent: string
  status: 'SUCCEEDED' | 'BLOCKED'
  summary: string
  evidence: string[]
  duration_ms: number
}

export type ToolExecution = {
  tool: string
  status: 'SUCCEEDED' | 'PENDING' | 'BLOCKED'
  message: string
  simulated: boolean
}

export type AgentResult = {
  severity: Severity
  confidence: number
  sla_minutes: number
  runbook: string
  evidence: string[]
  recommended_actions: string[]
  requires_approval: boolean
  auto_action: string
  stakeholder_message: string
  status: WorkflowStatus
  trace_id: string
  root_cause_hypotheses: string[]
  tool_executions: ToolExecution[]
  agent_trace: AgentStep[]
  llm_mode: 'deterministic-fallback'
  approval_id: string | null
}

export type EvaluationCase = Incident & {
  expected_severity: Severity
  expected_runbook: string
  expected_approval: boolean
}

export type EvaluationRow = {
  incident_id: string
  severity: Severity
  expected_severity: Severity
  severity_ok: boolean
  runbook: string
  expected_runbook: string
  runbook_ok: boolean
  approval: boolean
  expected_approval: boolean
  approval_ok: boolean
  status: WorkflowStatus
}

export type EvaluationSummary = {
  cases: number
  severity_accuracy: number
  runbook_accuracy: number
  approval_gate_accuracy: number
  rows: EvaluationRow[]
}
