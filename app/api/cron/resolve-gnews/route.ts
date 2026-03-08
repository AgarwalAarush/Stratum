import { NextResponse } from 'next/server'
import { getSupabaseClient } from '../../../../lib/server/supabase.ts'
import {
  cachedDecodeGoogleNewsUrl,
  extractGoogleNewsArticleId,
  persistResolvedUrl,
} from '../../../../lib/data/scrapers/registry.ts'

export const dynamic = 'force-dynamic'

const MAX_URLS_PER_RUN = 20
const BATCH_SIZE = 4
const BATCH_DELAY_MS = 2_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function handler() {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  // Find recent feed items with Google News URLs
  const since = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString()
  const { data: feedItems, error: feedError } = await supabase
    .from('feed_items')
    .select('url')
    .like('url', '%news.google.com%')
    .gte('fetched_at', since)
    .limit(200)

  if (feedError || !feedItems) {
    return NextResponse.json({ error: 'Failed to query feed_items', detail: String(feedError) }, { status: 500 })
  }

  // Extract article IDs, deduplicating
  const pendingMap = new Map<string, string>()
  for (const row of feedItems) {
    const articleId = extractGoogleNewsArticleId(row.url)
    if (articleId && !pendingMap.has(articleId)) {
      pendingMap.set(articleId, row.url)
    }
  }

  // Filter out already-resolved IDs
  const articleIds = [...pendingMap.keys()]
  if (articleIds.length === 0) {
    return NextResponse.json({ total: 0, alreadyResolved: 0, newlyResolved: 0, failed: 0 })
  }

  const { data: existing, error: resolvedError } = await supabase
    .from('gnews_resolved_urls')
    .select('article_id')
    .in('article_id', articleIds)

  if (resolvedError) {
    return NextResponse.json(
      { error: 'Failed to query resolved URLs', detail: String(resolvedError) },
      { status: 500 },
    )
  }

  const existingIds = new Set((existing ?? []).map((r: { article_id: string }) => r.article_id))
  const unresolved = articleIds.filter((id) => !existingIds.has(id))
  const toProcess = unresolved.slice(0, MAX_URLS_PER_RUN)

  let newlyResolved = 0
  let failed = 0

  // Process in small batches with delays
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(BATCH_DELAY_MS)

    const batch = toProcess.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(
      batch.map(async (articleId) => {
        const url = pendingMap.get(articleId)!
        const resolved = await cachedDecodeGoogleNewsUrl(url)
        if (resolved) {
          void persistResolvedUrl(articleId, resolved)
          newlyResolved++
        } else {
          failed++
        }
      }),
    )
  }

  return NextResponse.json({
    total: pendingMap.size,
    alreadyResolved: existingIds.size,
    newlyResolved,
    failed,
  })
}

export async function POST(request: Request) {
  const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs')
  const verified = verifySignatureAppRouter(handler)
  return verified(request)
}
