import Anthropic from '@anthropic-ai/sdk'
import {
  fetchDailyOverviews,
  fetchWeeklyOverviews,
  fetchLatestOverview,
  saveOverview,
} from './overview-persistence'

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  return new Anthropic({ apiKey })
}

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
}

export async function generateWeeklyOverview(): Promise<{
  success: boolean
  content?: string
  date?: string
  error?: string
}> {
  const client = getClient()
  if (!client) return { success: false, error: 'No Anthropic API key' }

  const now = new Date()
  const dayOfWeek = now.getUTCDay()
  const mondayOffset = dayOfWeek === 0 ? 7 : dayOfWeek
  const prevMonday = new Date(now)
  prevMonday.setUTCDate(now.getUTCDate() - mondayOffset - 6)
  const prevSunday = new Date(prevMonday)
  prevSunday.setUTCDate(prevMonday.getUTCDate() + 6)

  const startDate = prevMonday.toISOString().slice(0, 10)
  const endDate = prevSunday.toISOString().slice(0, 10)

  const dailies = await fetchDailyOverviews(startDate, endDate)
  if (dailies.length === 0) {
    return { success: false, error: 'No daily overviews found for the period' }
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

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = extractText(message)
  await saveOverview('weekly', content, startDate, startDate, endDate)

  return { success: true, content, date: startDate }
}

export async function generateMonthlyOverview(): Promise<{
  success: boolean
  content?: string
  date?: string
  error?: string
}> {
  const client = getClient()
  if (!client) return { success: false, error: 'No Anthropic API key' }

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
    return { success: false, error: 'No overviews found for the period' }
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

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3072,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = extractText(message)
  await saveOverview('monthly', content, today, startDate, today)

  return { success: true, content, date: today }
}
