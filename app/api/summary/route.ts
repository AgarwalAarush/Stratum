import { createHash } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseClient } from '@/lib/server/supabase'
import { scrapeArticle } from '@/lib/data/scrapers/registry'

const inflight = new Map<string, Promise<string | null>>()

function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex')
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return new Response(sseEvent({ type: 'error', message: 'Missing url parameter' }), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  const urlHash = hashUrl(url)
  const supabase = getSupabaseClient()

  // Check Supabase cache
  if (supabase) {
    const { data } = await supabase
      .from('article_summaries')
      .select('summary, title')
      .eq('url_hash', urlHash)
      .single()

    if (data?.summary) {
      const body = sseEvent({ type: 'done', summary: data.summary, title: data.title ?? '' })
      return new Response(body, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      })
    }
  }

  // Dedup: if already generating for this URL, wait for it
  const existing = inflight.get(urlHash)
  if (existing) {
    const summary = await existing
    if (summary) {
      return new Response(sseEvent({ type: 'done', summary }), {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      })
    }
    return new Response(sseEvent({ type: 'error', message: 'Summary generation failed' }), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  // Stream response
  const encoder = new TextEncoder()
  let resolveInflight: (value: string | null) => void
  const inflightPromise = new Promise<string | null>((resolve) => {
    resolveInflight = resolve
  })
  inflight.set(urlHash, inflightPromise)

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const article = await scrapeArticle(url)
        if (!article || !article.content) {
          controller.enqueue(encoder.encode(sseEvent({ type: 'error', message: 'Could not fetch article content' })))
          controller.close()
          resolveInflight!(null)
          inflight.delete(urlHash)
          return
        }

        controller.enqueue(encoder.encode(sseEvent({ type: 'meta', title: article.title })))

        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!apiKey) {
          controller.enqueue(encoder.encode(sseEvent({ type: 'error', message: 'Summary service unavailable' })))
          controller.close()
          resolveInflight!(null)
          inflight.delete(urlHash)
          return
        }

        const anthropic = new Anthropic({ apiKey })
        const messageStream = anthropic.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          messages: [
            {
              role: 'user',
              content: `Summarize this article in 2-3 concise sentences. Focus on the key finding, announcement, or insight. Be specific and analytical.\n\nTitle: ${article.title}\n\n${article.content}`,
            },
          ],
        })

        let fullText = ''

        messageStream.on('text', (text) => {
          fullText += text
          controller.enqueue(encoder.encode(sseEvent({ type: 'chunk', text })))
        })

        messageStream.on('end', () => {
          controller.enqueue(encoder.encode(sseEvent({ type: 'done', summary: fullText, title: article.title })))
          controller.close()
          resolveInflight!(fullText)
          inflight.delete(urlHash)

          // Persist to Supabase (fire-and-forget)
          if (supabase && fullText) {
            supabase
              .from('article_summaries')
              .upsert({ url_hash: urlHash, url, title: article.title, summary: fullText })
              .then(() => {})
          }
        })

        messageStream.on('error', () => {
          controller.enqueue(encoder.encode(sseEvent({ type: 'error', message: 'Summary generation failed' })))
          controller.close()
          resolveInflight!(null)
          inflight.delete(urlHash)
        })
      } catch {
        controller.enqueue(encoder.encode(sseEvent({ type: 'error', message: 'Unexpected error' })))
        controller.close()
        resolveInflight!(null)
        inflight.delete(urlHash)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
