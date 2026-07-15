import { AI_MODELS } from '../ai/config.ts'
import { generateOpenAIJson } from '../server/openai-responses.ts'
import { runCodexJson } from '../server/codex-exec.ts'
import {
  fetchDailyOverviews,
  fetchGlobalNewsDailyOverviews,
  fetchWeeklyOverviews,
  fetchLatestOverview,
  saveOverview,
} from './overview-persistence.ts'

interface WeeklyOverviewOptions {
  now?: Date
  provider?: 'responses' | 'codex'
  loadData?: (startDate: string, endDate: string) => Promise<{
    dailies: Awaited<ReturnType<typeof fetchDailyOverviews>>
    globalNewsDailies: Awaited<ReturnType<typeof fetchGlobalNewsDailyOverviews>>
  }>
  persist?: typeof saveOverview
}

export async function generateWeeklyOverview(options: WeeklyOverviewOptions = {}): Promise<{
  success: boolean
  content?: string
  date?: string
  error?: string
}> {
  const apiKey = process.env.OPENAI_API_KEY
  if (options.provider !== 'codex' && !apiKey) return { success: false, error: 'No OpenAI API key' }

  const now = options.now ?? new Date()
  const dayOfWeek = now.getUTCDay()
  const mondayOffset = dayOfWeek === 0 ? 7 : dayOfWeek
  const prevMonday = new Date(now)
  prevMonday.setUTCDate(now.getUTCDate() - mondayOffset - 6)
  const prevSunday = new Date(prevMonday)
  prevSunday.setUTCDate(prevMonday.getUTCDate() + 6)

  const startDate = prevMonday.toISOString().slice(0, 10)
  const endDate = prevSunday.toISOString().slice(0, 10)

  const { dailies, globalNewsDailies } = options.loadData
    ? await options.loadData(startDate, endDate)
    : await Promise.all([
      fetchDailyOverviews(startDate, endDate),
      fetchGlobalNewsDailyOverviews(startDate, endDate),
    ]).then(([loadedDailies, loadedGlobalNewsDailies]) => ({
      dailies: loadedDailies,
      globalNewsDailies: loadedGlobalNewsDailies,
    }))
  if (dailies.length === 0 && globalNewsDailies.length === 0) {
    return { success: false, error: 'No daily overviews found for the period' }
  }

  const dailySummary = dailies
    .map((d) => `[${d.date}]\n${d.bullets.map((b) => `- ${b}`).join('\n')}`)
    .join('\n\n')

  const globalNewsDailySummary = globalNewsDailies
    .map((d) => `[${d.date}]\n${d.bullets.map((b) => `- ${b}`).join('\n')}`)
    .join('\n\n')

  const prompt = `You are an analytical intelligence briefing writer for a tech intelligence dashboard called Stratum. Below are the daily AI and global news overview bullet points from the past week (${startDate} to ${endDate}).

${dailies.length > 0 ? `AI & Tech Daily Overviews:\n${dailySummary}` : ''}

${globalNewsDailies.length > 0 ? `Global News Daily Overviews:\n${globalNewsDailySummary}` : ''}

Write a weekly intelligence briefing that:
- Identifies 3-5 significant themes or trends from the week across both AI/tech and global affairs
- Draws connections between seemingly unrelated events across domains (tech, geopolitics, policy, markets)
- Notes emerging patterns that aren't obvious from individual daily summaries
- Highlights what to watch in the coming week
- Uses a mix of analytical paragraphs and bullet points
- Is 400-600 words

Write in a direct, analytical tone. No fluff or filler. Return the briefing content as markdown in the required field.`

  const schema = {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content'],
      additionalProperties: false,
    }
  const validate = (value: unknown) => {
    if (typeof value !== 'object' || value === null || !('content' in value) || typeof value.content !== 'string') {
      throw new Error('Weekly overview response is invalid')
    }
    return { content: value.content }
  }
  const result = options.provider === 'codex'
    ? await runCodexJson({ prompt, schemaPath: 'schemas/periodic-overview.schema.json', validate })
    : await generateOpenAIJson({
      apiKey: apiKey!, model: AI_MODELS.scheduledSynthesis, input: prompt,
      schemaName: 'stratum_weekly_overview', schema, maxOutputTokens: 2_048, validate,
    })

  const content = result.data.content
  await (options.persist ?? saveOverview)('weekly', content, startDate, startDate, endDate)

  return { success: true, content, date: startDate }
}

interface MonthlyOverviewOptions {
  now?: Date
  provider?: 'responses' | 'codex'
  loadData?: (startDate: string, endDate: string) => Promise<{
    dailies: Awaited<ReturnType<typeof fetchDailyOverviews>>
    globalNewsDailies: Awaited<ReturnType<typeof fetchGlobalNewsDailyOverviews>>
    weeklies: Awaited<ReturnType<typeof fetchWeeklyOverviews>>
    previousMonthly: Awaited<ReturnType<typeof fetchLatestOverview>>
  }>
  persist?: typeof saveOverview
}

export async function generateMonthlyOverview(options: MonthlyOverviewOptions = {}): Promise<{
  success: boolean
  content?: string
  date?: string
  error?: string
}> {
  const apiKey = process.env.OPENAI_API_KEY
  if (options.provider !== 'codex' && !apiKey) return { success: false, error: 'No OpenAI API key' }

  const now = options.now ?? new Date()
  const today = now.toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setUTCDate(now.getUTCDate() - 30)
  const startDate = thirtyDaysAgo.toISOString().slice(0, 10)

  const { dailies, globalNewsDailies, weeklies, previousMonthly } = options.loadData
    ? await options.loadData(startDate, today)
    : await Promise.all([
      fetchDailyOverviews(startDate, today),
      fetchGlobalNewsDailyOverviews(startDate, today),
      fetchWeeklyOverviews(startDate, today),
      fetchLatestOverview('monthly'),
    ]).then(([loadedDailies, loadedGlobalNewsDailies, loadedWeeklies, loadedPreviousMonthly]) => ({
      dailies: loadedDailies,
      globalNewsDailies: loadedGlobalNewsDailies,
      weeklies: loadedWeeklies,
      previousMonthly: loadedPreviousMonthly,
    }))

  if (dailies.length === 0 && globalNewsDailies.length === 0 && weeklies.length === 0) {
    return { success: false, error: 'No overviews found for the period' }
  }

  const dailySummary = dailies
    .map((d) => `[${d.date}]\n${d.bullets.map((b) => `- ${b}`).join('\n')}`)
    .join('\n\n')

  const globalNewsDailySummary = globalNewsDailies
    .map((d) => `[${d.date}]\n${d.bullets.map((b) => `- ${b}`).join('\n')}`)
    .join('\n\n')

  const weeklySummary = weeklies
    .map((w) => `[Week of ${w.date}]\n${w.content}`)
    .join('\n\n---\n\n')

  const previousSection = previousMonthly
    ? `\n\nPrevious Biweekly Briefing (${previousMonthly.date}):\n${previousMonthly.content}`
    : ''

  const prompt = `You are a strategic intelligence analyst for a tech intelligence dashboard called Stratum. Below are the daily AI and global news overviews, weekly briefings from the past 30 days, plus the previous biweekly briefing if available.

${dailies.length > 0 ? `AI & Tech Daily Overviews (${startDate} to ${today}):\n${dailySummary}` : ''}

${globalNewsDailies.length > 0 ? `Global News Daily Overviews (${startDate} to ${today}):\n${globalNewsDailySummary}` : ''}

${weeklies.length > 0 ? `Weekly Briefings:\n${weeklySummary}` : ''}${previousSection}

Write a biweekly strategic intelligence briefing that:
- Compares the current trajectory against the previous briefing — what accelerated, stalled, or reversed?
- Identifies cross-domain connections (tech + geopolitics, policy + VC, climate + supply chains, etc.)
- Highlights emerging themes gaining signal but not yet mainstream attention
- Provides 2-3 forward-looking observations for the next 2-4 weeks
- Uses a mix of analytical paragraphs and bullet points
- Is 600-900 words

Write in a direct, strategic tone. Focus on patterns, not events. Return the briefing content as markdown in the required field.`

  const schema = {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content'],
      additionalProperties: false,
    }
  const validate = (value: unknown) => {
    if (typeof value !== 'object' || value === null || !('content' in value) || typeof value.content !== 'string') {
      throw new Error('Monthly overview response is invalid')
    }
    return { content: value.content }
  }
  const result = options.provider === 'codex'
    ? await runCodexJson({ prompt, schemaPath: 'schemas/periodic-overview.schema.json', validate })
    : await generateOpenAIJson({
      apiKey: apiKey!, model: AI_MODELS.scheduledSynthesis, input: prompt,
      schemaName: 'stratum_monthly_overview', schema, maxOutputTokens: 3_072, validate,
    })

  const content = result.data.content
  await (options.persist ?? saveOverview)('monthly', content, today, startDate, today)

  return { success: true, content, date: today }
}
