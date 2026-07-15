import OpenAI from 'openai'
import { AI_PROVIDER, type GenerationMetadata } from '../ai/config.ts'

interface StreamTextOptions {
  apiKey: string
  model: string
  input: string
  maxOutputTokens: number
  signal?: AbortSignal
  onDelta: (text: string) => void
  fetchImpl?: typeof fetch
}

export interface StreamTextResult {
  text: string
  metadata: GenerationMetadata
}

export async function streamOpenAIText(options: StreamTextOptions): Promise<StreamTextResult> {
  const startedAt = Date.now()
  const client = new OpenAI({
    apiKey: options.apiKey,
    fetch: options.fetchImpl,
    maxRetries: 2,
    timeout: 30_000,
  })

  try {
    const stream = await client.responses.create({
      model: options.model,
      input: options.input,
      max_output_tokens: options.maxOutputTokens,
      reasoning: { effort: 'low' },
      text: { verbosity: 'low' },
      store: false,
      stream: true,
    }, { signal: options.signal })

    let text = ''
    for await (const event of stream) {
      if (event.type !== 'response.output_text.delta') continue
      text += event.delta
      options.onDelta(event.delta)
    }

    return {
      text,
      metadata: {
        provider: AI_PROVIDER,
        model: options.model,
        durationMs: Date.now() - startedAt,
        status: 'succeeded',
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw Object.assign(new Error(message), {
      metadata: {
        provider: AI_PROVIDER,
        model: options.model,
        durationMs: Date.now() - startedAt,
        status: 'failed' as const,
        error: message,
      } satisfies GenerationMetadata,
    })
  }
}
