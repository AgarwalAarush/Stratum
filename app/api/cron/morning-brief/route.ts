import { NextResponse } from 'next/server'
import { generateMorningBrief } from '../../../../lib/data/morning-brief'
import { saveMorningBrief } from '../../../../lib/data/overview-persistence'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
