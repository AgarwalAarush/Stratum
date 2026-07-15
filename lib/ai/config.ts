export const AI_PROVIDER = 'openai' as const

export const AI_MODELS = {
  articleSummary: process.env.OPENAI_ARTICLE_SUMMARY_MODEL ?? 'gpt-5.6-luna',
  scheduledSynthesis: process.env.CODEX_SYNTHESIS_MODEL ?? 'gpt-5.6-terra',
} as const

export interface GenerationMetadata {
  provider: typeof AI_PROVIDER
  model: string
  durationMs: number
  status: 'succeeded' | 'failed'
  error?: string
}
