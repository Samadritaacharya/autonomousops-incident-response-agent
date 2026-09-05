import { NextRequest, NextResponse } from 'next/server'
import { processIncident } from '@/lib/agent-engine'
import { MAX_INCIDENT_REQUEST_BYTES, parseIncidentRequest } from '@/lib/input-validation'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_INCIDENT_REQUEST_BYTES) {
    return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 })
  }

  let raw = ''
  try {
    raw = await request.text()
  } catch {
    return NextResponse.json({ error: 'Unable to read request body.' }, { status: 400 })
  }

  if (Buffer.byteLength(raw, 'utf8') > MAX_INCIDENT_REQUEST_BYTES) {
    return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const parsed = parseIncidentRequest(body, request.nextUrl.searchParams.get('approved') === 'true')
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status })
  }

  const result = processIncident(parsed.incident, parsed.approved, parsed.rejected)
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-AutonomousOps-Engine': 'deterministic-fallback',
    },
  })
}
