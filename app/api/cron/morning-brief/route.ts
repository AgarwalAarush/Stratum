import { NextResponse } from 'next/server'
import { generateMorningBrief } from '../../../../lib/data/morning-brief.ts'
import { saveMorningBrief } from '../../../../lib/data/overview-persistence.ts'

export const dynamic = 'force-dynamic'

async function handler() {
  try {
    const brief = await generateMorningBrief()
    await saveMorningBrief(brief)

    return NextResponse.json({
      success: true,
      date: new Date().toISOString().slice(0, 10),
      sectionCount: brief.sections.length,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to generate morning brief', detail: String(err) },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs')
  const verified = verifySignatureAppRouter(handler)
  return verified(request)
}
