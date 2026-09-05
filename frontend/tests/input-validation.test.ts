import assert from 'node:assert/strict'
import test from 'node:test'
import { parseIncidentRequest } from '../lib/input-validation.ts'

const base = {
  incident_id: ' INC-1 ',
  title: ' Checkout API timeout ',
  description: ' Requests are timing out. ',
  service: ' CHECKOUT-API ',
  environment: ' PRODUCTION ',
  customer_impact: ' Multiple users are affected. ',
  recent_change: true,
  source: ' api ',
  reporter: ' test ',
}

test('rejects non-object JSON bodies instead of crashing', () => {
  for (const value of [null, true, 42, 'incident', []]) {
    const parsed = parseIncidentRequest(value)
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.equal(parsed.status, 400)
  }
})

test('rejects missing, blank and wrong-type incident fields', () => {
  const missing = parseIncidentRequest({ ...base, title: undefined })
  const blank = parseIncidentRequest({ ...base, title: '   ' })
  const wrongType = parseIncidentRequest({ ...base, recent_change: 'true' })
  assert.equal(missing.ok, false)
  assert.equal(blank.ok, false)
  assert.equal(wrongType.ok, false)
})

test('rejects incident strings beyond supported limits', () => {
  const parsed = parseIncidentRequest({ ...base, description: 'x'.repeat(6_001) })
  assert.equal(parsed.ok, false)
  if (!parsed.ok) assert.equal(parsed.status, 422)
})

test('normalizes whitespace and service/environment casing', () => {
  const parsed = parseIncidentRequest(base)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.incident.incident_id, 'INC-1')
  assert.equal(parsed.incident.title, 'Checkout API timeout')
  assert.equal(parsed.incident.service, 'checkout-api')
  assert.equal(parsed.incident.environment, 'production')
  assert.equal(parsed.incident.source, 'api')
  assert.equal(parsed.incident.reporter, 'test')
})

test('accepts nested incident envelopes and approval decisions', () => {
  const approved = parseIncidentRequest({ incident: base, decision: 'APPROVE' })
  assert.equal(approved.ok, true)
  if (approved.ok) {
    assert.equal(approved.approved, true)
    assert.equal(approved.rejected, false)
  }

  const rejected = parseIncidentRequest({ incident: base, decision: ' reject ' })
  assert.equal(rejected.ok, true)
  if (rejected.ok) {
    assert.equal(rejected.approved, false)
    assert.equal(rejected.rejected, true)
  }
})

test('supports the backwards-compatible approved query switch', () => {
  const parsed = parseIncidentRequest(base, true)
  assert.equal(parsed.ok, true)
  if (parsed.ok) assert.equal(parsed.approved, true)
})

test('rejects conflicting or invalid approval inputs', () => {
  const conflict = parseIncidentRequest({ ...base, approved: true, decision: 'reject' })
  assert.equal(conflict.ok, false)
  if (!conflict.ok) assert.equal(conflict.status, 400)

  const invalidDecision = parseIncidentRequest({ ...base, decision: 'maybe' })
  assert.equal(invalidDecision.ok, false)
  if (!invalidDecision.ok) assert.equal(invalidDecision.status, 422)

  const invalidApproved = parseIncidentRequest({ ...base, approved: 'yes' })
  assert.equal(invalidApproved.ok, false)
  if (!invalidApproved.ok) assert.equal(invalidApproved.status, 422)
})
