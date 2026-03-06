// lib/data/arxiv.ts
import type { PaperItem } from '../types'

function extractTagContent(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
  return match ? match[1].trim() : ''
}

function extractAllTagContent(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g')
  const results: string[] = []
  let match
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim())
  }
  return results
}

export function parseArxivEntry(entry: string): PaperItem | null {
  try {
    const rawId = extractTagContent(entry, 'id')
    // arXiv id often looks like: https://arxiv.org/abs/2501.12948v1
    const idMatch = rawId.match(/abs\/([^?#]+?)(?:v\d+)?$/)
    const fallbackId = rawId.replace(/^.*abs\//, '').replace(/v\d+$/, '')
    const arxivId = (idMatch ? idMatch[1] : fallbackId).trim()

    const rawTitle = extractTagContent(entry, 'title')
    const title = rawTitle.replace(/\s+/g, ' ').trim()

    // Extract all author names
    const authorBlocks = extractAllTagContent(entry, 'author')
    const authors = authorBlocks
      .map(block => extractTagContent(block, 'name'))
      .filter(Boolean)

    // Format authors: "Last et al." if more than 2
    let authorDisplay: string[]
    if (authors.length === 0) {
      authorDisplay = ['Unknown']
    } else if (authors.length <= 2) {
      // Show last names only
      authorDisplay = authors.map(a => a.split(' ').pop() || a)
    } else {
      const firstLast = authors[0].split(' ').pop() || authors[0]
      authorDisplay = [firstLast, 'et al.']
    }

    const published = extractTagContent(entry, 'published')

    // Extract categories
    const categoryMatches = entry.match(/term="([^"]+)"/g) || []
    const categories = categoryMatches
      .map((m) => m.replace('term="', '').replace('"', ''))
      .filter(c => c.startsWith('cs.') || c.startsWith('stat.') || c.startsWith('math.'))
      .slice(0, 3)

    // Get HTML link
    const linkMatch = entry.match(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"/)
      || entry.match(/<link[^>]+href="([^"]+)"[^>]+type="text\/html"/)
      || entry.match(/<link[^>]+type="text\/html"[^>]+href="([^"]+)"/)
    const url = linkMatch ? linkMatch[1] : `https://arxiv.org/abs/${arxivId}`

    return {
      type: 'paper',
      id: `arxiv-${arxivId}`,
      title,
      authors: authorDisplay,
      categories,
      publishedAt: published,
      url,
    }
  } catch {
    return null
  }
}

export async function fetchArxivPapers(limit = 15): Promise<PaperItem[]> {
  const query = 'cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL+OR+cat:cs.CV'
  const url = `https://export.arxiv.org/api/query?search_query=${query}&start=0&max_results=${limit}&sortBy=submittedDate&sortOrder=descending`

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Stratum/0.2' },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      throw new Error(`arXiv API error: ${res.status}`)
    }

    const xml = await res.text()

    // Parse entry blocks resiliently (handles optional entry attributes).
    const entryBlocks = Array.from(xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g))
      .map((match) => match[1] ?? '')
    const papers = entryBlocks
      .map(parseArxivEntry)
      .filter((p): p is PaperItem => p !== null)

    return papers
  } catch (error) {
    console.error('Failed to fetch arXiv papers:', error)
    return []
  }
}
