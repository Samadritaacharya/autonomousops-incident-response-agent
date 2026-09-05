import type { Incident } from './contracts.ts'

export const MAX_INCIDENT_REQUEST_BYTES = 32_768

const LIMITS = {
  incident_id: 100,
  title: 240,
  description: 6_000,
  service: 120,
  environment: 64,
  customer_impact: 2_000,
  source: 120,
  reporter: 120,
} as const

type RequestDecision = '' | 'approve' | 'reject'

type ParsedIncidentRequest = {
  ok: true
  incident: Incident
  approved: boolean
  rejected: boolean
}

type InvalidIncidentRequest = {
  ok: false
  status: 400 | 422
  error: string
}

export type IncidentRequestValidation = ParsedIncidentRequest | InvalidIncidentRequest

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizedRequiredString(
  item: Record<string, unknown>,
  key: keyof typeof LIMITS,
): string | null {
  const value = item[key]
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || normalized.length > LIMITS[key]) return null
  return normalized
}

function normalizedOptionalString(
  item: Record<string, unknown>,
  key: 'source' | 'reporter',
): string | undefined | null {
  const value = item[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || normalized.length > LIMITS[key]) return null
  return normalized
}

function normalizeIncident(value: unknown): Incident | null {
  if (!isRecord(value)) return null

  const incidentId = normalizedRequiredString(value, 'incident_id')
  const title = normalizedRequiredString(value, 'title')
  const description = normalizedRequiredString(value, 'description')
  const service = normalizedRequiredString(value, 'service')
  const environment = normalizedRequiredString(value, 'environment')
  const customerImpact = normalizedRequiredString(value, 'customer_impact')
  const source = normalizedOptionalString(value, 'source')
  const reporter = normalizedOptionalString(value, 'reporter')

  if (
    !incidentId ||
    !title ||
    !description ||
    !service ||
    !environment ||
    !customerImpact ||
    source === null ||
    reporter === null ||
    typeof value.recent_change !== 'boolean'
  ) {
    return null
  }

  return {
    incident_id: incidentId,
    title,
    description,
    service: service.toLowerCase(),
    environment: environment.toLowerCase(),
    customer_impact: customerImpact,
    recent_change: value.recent_change,
    ...(source ? { source } : {}),
    ...(reporter ? { reporter } : {}),
  }
}

export function parseIncidentRequest(value: unknown, approvedQuery = false): IncidentRequestValidation {
  if (!isRecord(value)) {
    return { ok: false, status: 400, error: 'Request body must be a JSON object.' }
  }

  const rawDecision = value.decision
  if (rawDecision !== undefined && typeof rawDecision !== 'string') {
    return { ok: false, status: 422, error: 'decision must be either approve or reject.' }
  }

  const decision = (typeof rawDecision === 'string' ? rawDecision.trim().toLowerCase() : '') as RequestDecision
  if (!['', 'approve', 'reject'].includes(decision)) {
    return { ok: false, status: 422, error: 'decision must be either approve or reject.' }
  }

  const bodyApproved = value.approved === true
  if (value.approved !== undefined && typeof value.approved !== 'boolean') {
    return { ok: false, status: 422, error: 'approved must be a boolean when provided.' }
  }

  const approved = approvedQuery || bodyApproved || decision === 'approve'
  const rejected = decision === 'reject'
  if (approved && rejected) {
    return { ok: false, status: 400, error: 'Approval and rejection cannot be requested together.' }
  }

  const candidate = value.incident ?? value
  const incident = normalizeIncident(candidate)
  if (!incident) {
    return {
      ok: false,
      status: 422,
      error:
        'A valid incident requires incident_id, title, description, service, environment, customer_impact and recent_change within supported size limits.',
    }
  }

  return { ok: true, incident, approved, rejected }
}
