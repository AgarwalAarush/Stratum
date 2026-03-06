import { NextResponse } from 'next/server'
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'

export const dynamic = 'force-dynamic'
import { generateMonthlyOverview } from '../../../../lib/data/overview-generators'

async function handler() {
  try {
    const result = await generateMonthlyOverview()

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
      { error: 'Failed to generate monthly overview', detail: String(err) },
      { status: 500 },
    )
  }
}

export const POST = verifySignatureAppRouter(handler)
