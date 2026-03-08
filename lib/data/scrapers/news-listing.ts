import { hashString, type ParsedFeedItem } from '../rss-parser.ts'

const FETCH_TIMEOUT_MS = 10_000

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Stratum/0.2; +https://stratum.aarushagarwal.dev)',
        Accept: 'text/html',
      },
      signal: controller.signal,
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function extractHeadlines(
  html: string,
  baseUrl: string,
  sourceName: string,
  maxItems: number,
): ParsedFeedItem[] {
  const items: ParsedFeedItem[] = []
  const seen = new Set<string>()

  // Match <a href="...">...<h2> or <h3>...</h2>/<h3>...</a> patterns
  // Also match standalone <h2>/<h3> with nearby anchors
  const anchorRe = /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null

  while ((match = anchorRe.exec(html)) !== null && items.length < maxItems) {
    const href = match[1]
    const inner = match[2]

    // Only pick anchors that contain h2 or h3 headlines
    if (!/<h[23][\s>]/i.test(inner)) continue

    const titleMatch = inner.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i)
    if (!titleMatch) continue

    const title = titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (!title || title.length < 10) continue

    let url = href
    if (url.startsWith('/')) url = baseUrl + url
    if (!url.startsWith('http')) continue

    const dedupeKey = title.toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    items.push({
      id: hashString(`${sourceName}:${url}`),
      source: sourceName,
      title,
      link: url,
      publishedAt: Date.now(),
    })
  }

  return items
}

async function scrapeSite(url: string, sourceName: string, maxItems: number): Promise<ParsedFeedItem[]> {
  const html = await fetchHtml(url)
  return html ? extractHeadlines(html, new URL(url).origin, sourceName, maxItems) : []
}

export async function scrapeApNews(maxItems = 5): Promise<ParsedFeedItem[]> {
  return scrapeSite('https://apnews.com/', 'AP News', maxItems)
}

export async function scrapeWsj(maxItems = 5): Promise<ParsedFeedItem[]> {
  return scrapeSite('https://www.wsj.com/', 'WSJ', maxItems)
}
