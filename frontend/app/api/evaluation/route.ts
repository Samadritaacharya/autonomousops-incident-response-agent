import { NextResponse } from 'next/server'
import { evaluateEngine } from '@/lib/agent-engine'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json(evaluateEngine(), {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
  })
}
