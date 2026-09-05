import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateEngine, processIncident } from '../lib/agent-engine.ts'
import { evaluationCases } from '../lib/evaluation-fixtures.ts'

for (const fixture of evaluationCases) {
  test(`${fixture.incident_id} matches the Python evaluation contract`, () => {
    const result = processIncident(fixture)
    assert.equal(result.severity, fixture.expected_severity)
    assert.equal(result.runbook, fixture.expected_runbook)
    assert.equal(result.requires_approval, fixture.expected_approval)
    assert.equal(result.llm_mode, 'deterministic-fallback')
    assert.ok(result.agent_trace.length >= 7)
    assert.equal(result.tool_executions[0]?.tool, 'collect diagnostics')
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

test('evaluation remains reproducible at the checked-in baseline', () => {
  const summary = evaluateEngine()
  assert.equal(summary.cases, 8)
  assert.equal(summary.severity_accuracy, 1)
  assert.equal(summary.runbook_accuracy, 1)
  assert.equal(summary.approval_gate_accuracy, 1)
})

test('an explicit rejection blocks the proposed high-risk remediation', () => {
  const incident = evaluationCases[0]
  const rejected = processIncident(incident, false, true)
  assert.equal(rejected.status, 'ACTION_BLOCKED')
  assert.equal(rejected.approval_id, null)
  assert.equal(rejected.tool_executions.at(-1)?.status, 'BLOCKED')
  assert.match(rejected.tool_executions.at(-1)?.message ?? '', /rejected remediation/i)
})
