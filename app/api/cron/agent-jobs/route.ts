import { NextResponse } from 'next/server'
import { buildAgentJobDedupeKey, enqueueAgentJob, parseAgentJobType } from '../../../../lib/server/agent-jobs.ts'

export const dynamic = 'force-dynamic'

export async function enqueueHandler(request: Request) {
  try {
    const body = await request.json() as { jobType?: unknown; payload?: unknown }
    const jobType = parseAgentJobType(body.jobType)
    const payload = typeof body.payload === 'object' && body.payload !== null && !Array.isArray(body.payload)
      ? body.payload as Record<string, unknown>
      : {}
    const job = await enqueueAgentJob(jobType, payload, buildAgentJobDedupeKey(jobType, new Date(), payload))
    return NextResponse.json({ accepted: true, ...job }, { status: 202 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to enqueue job' }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs')
  return verifySignatureAppRouter(enqueueHandler)(request)
}
