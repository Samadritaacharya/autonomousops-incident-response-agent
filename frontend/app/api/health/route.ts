import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'autonomousops-command-center',
    engine: 'deterministic-fallback',
    paid_api_required: false,
  })
}
