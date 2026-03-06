export interface ParsedFeedItem {
  id: string
  source: string
  title: string
  link: string
  publishedAt: number
}

export function hashString(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, num) => String.fromCharCode(parseInt(num, 16)))
}

function extractTag(block: string, tag: string): string {
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i')
  const plainRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')

  const cdata = block.match(cdataRegex)
  if (cdata?.[1]) return cdata[1].trim()

  const plain = block.match(plainRegex)
  if (!plain?.[1]) return ''

  return decodeXmlEntities(plain[1].replace(/<[^>]+>/g, '').trim())
}

function parsePublishedAt(block: string, isAtom: boolean): number {
  const raw = isAtom
    ? extractTag(block, 'published') || extractTag(block, 'updated')
    : extractTag(block, 'pubDate')

  if (!raw) return Date.now()

  const parsed = new Date(raw).getTime()
  return Number.isNaN(parsed) ? Date.now() : parsed
}

export function parseFeedXml(xml: string, feedName: string): ParsedFeedItem[] {
  const itemRegex = /<item[\s\S]*?>[\s\S]*?<\/item>/gi
  const entryRegex = /<entry[\s\S]*?>[\s\S]*?<\/entry>/gi

  let blocks = [...(xml.match(itemRegex) ?? [])]
  let isAtom = false

  if (blocks.length === 0) {
    blocks = [...(xml.match(entryRegex) ?? [])]
    isAtom = true
  }

  const parsed: ParsedFeedItem[] = []

  for (const rawBlock of blocks.slice(0, 5)) {
    const block = rawBlock.toString()
    const title = extractTag(block, 'title')
    if (!title) continue

    let link = ''
    if (isAtom) {
      const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i)
      link = hrefMatch?.[1]?.trim() ?? ''
    } else {
      link = extractTag(block, 'link')
    }

    const publishedAt = parsePublishedAt(block, isAtom)
    const idBase = link || title

    parsed.push({
      id: `news-${hashString(`${feedName}:${idBase}`)}`,
      source: feedName,
      title: title.replace(/\s+/g, ' ').trim(),
      link,
      publishedAt,
    })
  }

  return parsed
}
