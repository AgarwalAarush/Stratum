import type { ArticleScraper } from './types'

export const githubScraper: ArticleScraper = {
  domains: ['github.com'],
  async scrape(url) {
    // Extract owner/repo from URL like https://github.com/owner/repo
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/)
    if (!match) return null

    const [, owner, repo] = match
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3.raw',
    }
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
    }

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      { headers, signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) return null

    const text = await res.text()
    // Strip markdown formatting roughly
    const plain = text
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
      .replace(/[*_`~]+/g, '')
      .replace(/<[^>]+>/g, '')
      .trim()

    return {
      title: `${owner}/${repo}`,
      content: plain.slice(0, 4000),
      url,
    }
  },
}
