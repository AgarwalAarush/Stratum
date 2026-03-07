import { NextResponse } from 'next/server'
import { generateWeeklyOverview } from '../../../../lib/data/overview-generators.ts'

export const dynamic = 'force-dynamic'

async function handler() {
  try {
    const result = await generateWeeklyOverview()

    if (!result.success) {
      const status = result.error === 'No Anthropic API key' ? 500 : 404
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json({
      success: true,
      date: result.date,
      wordCount: result.content!.split(/\s+/).length,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to generate weekly overview', detail: String(err) },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs')
  const verified = verifySignatureAppRouter(handler)
  return verified(request)
}
