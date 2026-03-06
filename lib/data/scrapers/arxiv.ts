import type { ArticleScraper } from './types'
import { parseHTML } from 'linkedom'

export const arxivScraper: ArticleScraper = {
  domains: ['arxiv.org'],
  async scrape(url) {
    // Ensure we're hitting the abstract page
    const absUrl = url.replace('/pdf/', '/abs/').replace('.pdf', '')

    const res = await fetch(absUrl, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null

    const html = await res.text()
    const { document } = parseHTML(html)

    const abstractEl = document.querySelector('blockquote.abstract')
    if (!abstractEl) return null

    const titleEl = document.querySelector('h1.title')
    const title = titleEl?.textContent?.replace(/^Title:\s*/i, '').trim() ?? ''
    const content = abstractEl.textContent?.replace(/^Abstract:\s*/i, '').trim() ?? ''

    return { title, content: content.slice(0, 4000), url }
  },
}
