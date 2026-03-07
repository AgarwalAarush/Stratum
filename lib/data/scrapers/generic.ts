import type { ArticleScraper } from './types.ts'
import { parseHTML } from 'linkedom'

const STRIP_TAGS = new Set(['nav', 'footer', 'aside', 'script', 'style', 'noscript', 'header', 'form', 'svg'])

function extractText(doc: Document): string {
  // Remove unwanted elements
  for (const tag of STRIP_TAGS) {
    for (const el of Array.from(doc.querySelectorAll(tag))) {
      el.remove()
    }
  }

  // Try semantic containers first
  const article = doc.querySelector('article') ?? doc.querySelector('main') ?? doc.querySelector('[role="main"]')
  if (article) {
    const text = article.textContent?.trim() ?? ''
    if (text.length > 100) return text
  }

  // Fallback: find largest text block among divs/sections
  let best = ''
  for (const el of Array.from(doc.querySelectorAll('div, section'))) {
    const text = el.textContent?.trim() ?? ''
    if (text.length > best.length) best = text
  }

  return best || doc.body?.textContent?.trim() || ''
}

export const genericScraper: ArticleScraper = {
  domains: [], // fallback, no specific domains
  async scrape(url) {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Stratum/0.1; +https://github.com)' },
    })
    if (!res.ok) return null

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) return null

    const html = await res.text()
    const { document } = parseHTML(html)

    const titleEl = document.querySelector('title')
    const title = titleEl?.textContent?.trim() ?? ''

    const content = extractText(document as unknown as Document)
    if (content.length < 50) return null

    // Collapse whitespace and truncate
    const cleaned = content.replace(/\s+/g, ' ').trim()
    return { title, content: cleaned.slice(0, 4000), url }
  },
}
