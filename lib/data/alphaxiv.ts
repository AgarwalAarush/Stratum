// lib/data/alphaxiv.ts
import type { PaperItem } from '../types'

interface AlphaxivPaper {
  universal_paper_id: string
  title: string
  authors: { name: string }[] | string[]
  topics: string[]
  first_publication_date: string
  canonical_id?: string
}

interface AlphaxivResponse {
  papers?: AlphaxivPaper[]
  data?: AlphaxivPaper[]
}

function formatAuthors(authors: { name: string }[] | string[]): string[] {
  const names = authors.map(a => (typeof a === 'string' ? a : a.name))
  if (names.length === 0) return ['Unknown']
  if (names.length <= 2) return names.map(n => n.split(' ').pop() || n)
  const firstLast = names[0].split(' ').pop() || names[0]
  return [firstLast, 'et al.']
}

export async function fetchAlphaxivPapers(limit = 20): Promise<PaperItem[]> {
  const topics = JSON.stringify(['cs.AI', 'cs.LG', 'cs.CL', 'cs.CV'])
  const params = new URLSearchParams({
    pageNum: '1',
    pageSize: String(limit),
    sort: 'Hot',
    interval: 'All time',
    topics,
  })
  const url = `https://api.alphaxiv.org/papers/v3/feed?${params}`

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Stratum/0.2' },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) throw new Error(`alphaxiv API error: ${res.status}`)

    const json: AlphaxivResponse = await res.json()
    const papers: AlphaxivPaper[] = json.papers ?? json.data ?? []

    return papers.map((p): PaperItem => {
      const categories = (p.topics ?? [])
        .filter(t => /^cs\.|^stat\.|^math\./.test(t))
        .slice(0, 3)

      return {
        type: 'paper',
        id: `alphaxiv-${p.universal_paper_id}`,
        title: p.title,
        authors: formatAuthors(p.authors ?? []),
        categories,
        publishedAt: p.first_publication_date,
        url: `https://alphaxiv.org/abs/${p.universal_paper_id}`,
      }
    })
  } catch (error) {
    console.error('Failed to fetch alphaxiv papers:', error)
    return []
  }
}
