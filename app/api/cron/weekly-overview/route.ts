import { NextResponse } from 'next/server'
import { generateWeeklyOverview } from '../../../../lib/data/overview-generators'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
