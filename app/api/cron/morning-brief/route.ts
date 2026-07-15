import { NextResponse } from 'next/server'
import { buildAgentJobDedupeKey, enqueueAgentJob } from '../../../../lib/server/agent-jobs.ts'

export const dynamic = 'force-dynamic'

async function handler() {
  try {
    const jobType = 'generate-morning-brief' as const
    const job = await enqueueAgentJob(jobType, {}, buildAgentJobDedupeKey(jobType))
    return NextResponse.json({
      accepted: true,
      ...job,
    }, { status: 202 })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to enqueue morning brief', detail: String(err) },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs')
  const verified = verifySignatureAppRouter(handler)
  return verified(request)
}
