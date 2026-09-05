import { NextRequest, NextResponse } from 'next/server'
import { processIncident } from '@/lib/agent-engine'
import type { Incident } from '@/lib/contracts'

export const runtime = 'nodejs'

function isIncident(value: unknown): value is Incident {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const required = ['incident_id', 'title', 'description', 'service', 'environment', 'customer_impact']
  return required.every((key) => typeof item[key] === 'string' && String(item[key]).trim().length > 0)
    && typeof item.recent_change === 'boolean'
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const candidate = (body.incident ?? body) as unknown
  if (!isIncident(candidate)) {
    return NextResponse.json(
      { error: 'incident_id, title, description, service, environment, customer_impact and recent_change are required.' },
      { status: 422 },
    )
  }

  const approvedQuery = request.nextUrl.searchParams.get('approved') === 'true'
  const decision = typeof body.decision === 'string' ? body.decision.toLowerCase() : ''
  const approved = approvedQuery || body.approved === true || decision === 'approve'
  const rejected = decision === 'reject'
  const result = processIncident(candidate, approved, rejected)

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store',
      'X-AutonomousOps-Engine': 'deterministic-fallback',
    },
  })
}
