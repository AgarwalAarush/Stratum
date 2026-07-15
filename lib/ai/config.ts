export const AI_PROVIDER = 'openai' as const

export const AI_MODELS = {
  articleSummary: process.env.OPENAI_ARTICLE_SUMMARY_MODEL ?? 'gpt-5.6-luna',
  dailyOverview: process.env.OPENAI_DAILY_OVERVIEW_MODEL ?? 'gpt-5.6-luna',
  morningBrief: process.env.OPENAI_MORNING_BRIEF_MODEL ?? 'gpt-5.6-terra',
  scheduledSynthesis: process.env.CODEX_SYNTHESIS_MODEL ?? 'gpt-5.6-terra',
} as const

export interface GenerationMetadata {
  provider: typeof AI_PROVIDER
  model: string
  durationMs: number
  status: 'succeeded' | 'failed'
  error?: string
}
