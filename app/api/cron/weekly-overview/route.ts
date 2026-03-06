import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { fetchDailyOverviews, saveOverview } from '../../../../lib/data/overview-persistence'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'No Anthropic API key' }, { status: 500 })
  }

  // Calculate previous week range (Mon-Sun)
  const now = new Date()
  const dayOfWeek = now.getUTCDay() // 0=Sun, 1=Mon
  const mondayOffset = dayOfWeek === 0 ? 7 : dayOfWeek
  const prevMonday = new Date(now)
  prevMonday.setUTCDate(now.getUTCDate() - mondayOffset - 6)
  const prevSunday = new Date(prevMonday)
  prevSunday.setUTCDate(prevMonday.getUTCDate() + 6)

  const startDate = prevMonday.toISOString().slice(0, 10)
  const endDate = prevSunday.toISOString().slice(0, 10)

  const dailies = await fetchDailyOverviews(startDate, endDate)
  if (dailies.length === 0) {
    return NextResponse.json({ error: 'No daily overviews found for the period' }, { status: 404 })
  }

  const dailySummary = dailies
    .map((d) => `[${d.date}]\n${d.bullets.map((b) => `- ${b}`).join('\n')}`)
    .join('\n\n')

  const prompt = `You are an analytical intelligence briefing writer for a tech intelligence dashboard called Stratum. Below are the daily AI overview bullet points from the past week (${startDate} to ${endDate}).

Daily Overviews:
${dailySummary}

Write a weekly intelligence briefing that:
- Identifies 3-5 significant themes or trends from the week
- Draws connections between seemingly unrelated events across domains
- Notes emerging patterns that aren't obvious from individual daily summaries
- Highlights what to watch in the coming week
- Uses a mix of analytical paragraphs and bullet points
- Is 400-600 words

Write in a direct, analytical tone. No fluff or filler. Return only the briefing content as markdown.`

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    await saveOverview('weekly', content, startDate, startDate, endDate)

    return NextResponse.json({ success: true, date: startDate, wordCount: content.split(/\s+/).length })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to generate weekly overview', detail: String(err) },
      { status: 500 },
    )
  }
}
