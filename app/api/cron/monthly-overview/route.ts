import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import {
  fetchDailyOverviews,
  fetchWeeklyOverviews,
  fetchLatestOverview,
  saveOverview,
} from '../../../../lib/data/overview-persistence'

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

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setUTCDate(now.getUTCDate() - 30)
  const startDate = thirtyDaysAgo.toISOString().slice(0, 10)

  const [dailies, weeklies, previousMonthly] = await Promise.all([
    fetchDailyOverviews(startDate, today),
    fetchWeeklyOverviews(startDate, today),
    fetchLatestOverview('monthly'),
  ])

  if (dailies.length === 0 && weeklies.length === 0) {
    return NextResponse.json({ error: 'No overviews found for the period' }, { status: 404 })
  }

  const dailySummary = dailies
    .map((d) => `[${d.date}]\n${d.bullets.map((b) => `- ${b}`).join('\n')}`)
    .join('\n\n')

  const weeklySummary = weeklies
    .map((w) => `[Week of ${w.date}]\n${w.content}`)
    .join('\n\n---\n\n')

  const previousSection = previousMonthly
    ? `\n\nPrevious Biweekly Briefing (${previousMonthly.date}):\n${previousMonthly.content}`
    : ''

  const prompt = `You are a strategic intelligence analyst for a tech intelligence dashboard called Stratum. Below are the daily and weekly overviews from the past 30 days, plus the previous biweekly briefing if available.

Daily Overviews (${startDate} to ${today}):
${dailySummary}

${weeklies.length > 0 ? `Weekly Briefings:\n${weeklySummary}` : ''}${previousSection}

Write a biweekly strategic intelligence briefing that:
- Compares the current trajectory against the previous briefing — what accelerated, stalled, or reversed?
- Identifies cross-domain connections (policy + VC + open source momentum, etc.)
- Highlights emerging themes gaining signal but not yet mainstream attention
- Provides 2-3 forward-looking observations for the next 2-4 weeks
- Uses a mix of analytical paragraphs and bullet points
- Is 600-900 words

Write in a direct, strategic tone. Focus on patterns, not events. Return only the briefing content as markdown.`

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3072,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    await saveOverview('monthly', content, today, startDate, today)

    return NextResponse.json({ success: true, date: today, wordCount: content.split(/\s+/).length })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to generate monthly overview', detail: String(err) },
      { status: 500 },
    )
  }
}
