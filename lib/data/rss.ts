import type { NewsItem } from '../types'
import { cachedFetchWithFallback } from '../server/cache.ts'
import { parseFeedXml, type ParsedFeedItem } from './rss-parser.ts'

export interface ServerFeed {
  name: string
  url: string
}

export type NewsTopic =
  | 'general'
  | 'cybersecurity'
  | 'venture-capital'
  | 'policy'
  | 'new-technology'
  | 'startups'
  | 'infra-hardware'
  | 'tech-events'

const FEED_TIMEOUT_MS = 8_000
const OVERALL_DEADLINE_MS = 25_000
const BATCH_CONCURRENCY = 20
const DEFAULT_MAX_ITEMS = 20

const gn = (query: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`

export const NEWS_TOPICS: NewsTopic[] = [
  'general',
  'cybersecurity',
  'venture-capital',
  'policy',
  'new-technology',
  'startups',
  'infra-hardware',
  'tech-events',
]

const TOPIC_LABELS: Record<NewsTopic, string> = {
  general: 'General AI News',
  cybersecurity: 'Cybersecurity',
  'venture-capital': 'Venture Capital',
  policy: 'AI Policy & Regulation',
  'new-technology': 'New Technology',
  startups: 'Startups',
  'infra-hardware': 'Infra & Hardware',
  'tech-events': 'Tech Events',
}

export const NEWS_TOPIC_FEEDS: Record<NewsTopic, ServerFeed[]> = {
  general: [
    { name: 'AI News', url: gn('(OpenAI OR Anthropic OR "Google AI" OR Gemini OR DeepSeek OR Mistral OR Qwen OR "large language model" OR ChatGPT) when:1d') },
    { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/' },
    { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
    { name: 'MIT Tech Review AI', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed' },
    { name: 'MIT Research', url: 'https://news.mit.edu/rss/research' },
    { name: 'Reuters AI', url: gn('site:reuters.com "artificial intelligence" when:2d') },
    { name: 'Bloomberg Tech', url: gn('site:bloomberg.com "artificial intelligence" when:2d') },
    { name: 'OpenAI News', url: gn('OpenAI ChatGPT GPT-4 when:7d') },
    { name: 'Anthropic News', url: gn('Anthropic Claude AI when:7d') },
  ],
  cybersecurity: [
    { name: 'Krebs Security', url: 'https://krebsonsecurity.com/feed/' },
    { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews' },
    { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml' },
    { name: 'Schneier', url: 'https://www.schneier.com/feed/' },
    { name: 'CISA Advisories', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml' },
    { name: 'Cyber Incidents', url: gn('cyber attack OR data breach OR ransomware OR hacking when:3d') },
    { name: 'Ransomware.live', url: 'https://www.ransomware.live/rss.xml' },
  ],
  'venture-capital': [
    { name: 'TechCrunch Venture', url: 'https://techcrunch.com/category/venture/feed/' },
    { name: 'Crunchbase News', url: 'https://news.crunchbase.com/feed/' },
    { name: 'PitchBook News', url: gn('site:pitchbook.com when:7d') },
    { name: 'CB Insights', url: 'https://www.cbinsights.com/research/feed/' },
    { name: 'Fortune Term Sheet', url: gn('"Term Sheet" venture capital OR startup when:7d') },
    { name: 'Y Combinator Blog', url: 'https://www.ycombinator.com/blog/rss/' },
    { name: 'a16z Blog', url: gn('site:a16z.com OR "Andreessen Horowitz" blog when:14d') },
    { name: 'Sequoia Blog', url: gn('site:sequoiacap.com when:7d') },
    { name: 'VC Insights', url: gn('("venture capital" insights OR "VC trends" OR "startup advice") when:7d') },
  ],
  policy: [
    { name: 'Politico Tech', url: 'https://rss.politico.com/technology.xml' },
    { name: 'AI Regulation', url: gn('AI regulation OR "artificial intelligence" law OR policy when:7d') },
    { name: 'Tech Antitrust', url: gn('tech antitrust OR FTC Google OR FTC Apple OR FTC Amazon when:7d') },
    { name: 'EU Digital Policy', url: gn('("Digital Services Act" OR "Digital Markets Act" OR "EU AI Act" OR "GDPR") when:7d') },
    { name: 'Euractiv Digital', url: gn('site:euractiv.com digital OR tech when:7d') },
    { name: 'EU Commission Digital', url: gn('site:ec.europa.eu digital OR technology when:14d') },
    { name: 'UK Tech Policy', url: gn('(UK AI safety OR "Online Safety Bill" OR UK tech regulation) when:7d') },
    { name: 'India Tech Policy', url: gn('(India tech regulation OR India data protection OR India AI policy) when:7d') },
    { name: 'China Tech Policy', url: gn('(China tech regulation OR China AI policy OR MIIT technology) when:7d') },
  ],
  'new-technology': [
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
    { name: 'Hacker News', url: 'https://hnrss.org/frontpage' },
    { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/' },
    { name: 'ZDNet', url: 'https://www.zdnet.com/news/rss.xml' },
    { name: 'TechMeme', url: 'https://www.techmeme.com/feed.xml' },
    { name: 'Engadget', url: 'https://www.engadget.com/rss.xml' },
  ],
  startups: [
    { name: 'TechCrunch Startups', url: 'https://techcrunch.com/category/startups/feed/' },
    { name: 'Unicorn News', url: gn('("unicorn startup" OR "unicorn valuation" OR "$1 billion valuation") when:7d') },
    { name: 'New Unicorns', url: gn('("becomes unicorn" OR "joins unicorn" OR "reaches unicorn" OR "achieved unicorn") when:14d') },
    { name: 'IPO News', url: gn('(IPO OR "initial public offering" OR SPAC) tech when:7d') },
    { name: 'Tech IPO News', url: gn('tech IPO OR "tech company" IPO when:7d') },
    { name: 'Funding Rounds', url: gn('("funding round" OR "Series A" OR "Series B" OR "Series C" OR "raised" million) startup when:7d') },
    { name: 'Crunchbase Funding', url: gn('site:crunchbase.com "funding round" OR "series" when:7d') },
  ],
  'infra-hardware': [
    { name: "Tom's Hardware", url: 'https://www.tomshardware.com/feeds/all' },
    { name: 'SemiAnalysis', url: gn('site:semianalysis.com when:7d') },
    { name: 'Semiconductor News', url: gn('semiconductor OR chip OR TSMC OR NVIDIA OR Intel when:3d') },
    { name: 'InfoQ', url: 'https://feed.infoq.com/' },
    { name: 'The New Stack', url: 'https://thenewstack.io/feed/' },
    { name: 'DevOps.com', url: 'https://devops.com/feed/' },
    { name: 'Cloud Outages', url: gn('(Azure OR AWS OR GCP OR Cloudflare OR Slack OR GitHub) outage OR down when:1d') },
  ],
  'tech-events': [
    { name: 'Hackathons', url: gn('(hackathon OR "hack day" OR "coding competition" OR "build competition") when:14d') },
    { name: 'MLH Events', url: gn('site:mlh.io OR "Major League Hacking" hackathon when:30d') },
    { name: 'Devpost', url: gn('site:devpost.com hackathon when:14d') },
    { name: 'CTF Events', url: gn('(CTF OR "capture the flag" OR "cybersecurity competition") when:14d') },
    { name: 'AI Hackathons', url: gn('("AI hackathon" OR "ML hackathon" OR "LLM hackathon" OR "AI buildathon") when:14d') },
    { name: 'Developer Competitions', url: gn('("developer challenge" OR "coding challenge" OR "programming contest" OR "startup competition") when:14d') },
    { name: 'AI Conferences', url: gn('(AI conference OR "AI summit" OR "machine learning conference") when:30d') },
    { name: 'Cerebral Valley', url: gn('site:cerebralvalley.ai OR "Cerebral Valley" when:14d') },
    { name: 'Tech Conferences', url: gn('("developer conference" OR "tech summit" OR devcon OR "developer event") when:7d') },
  ],
}

function toNewsItem(item: ParsedFeedItem, topic: NewsTopic): NewsItem {
  return {
    type: 'news',
    id: item.id,
    title: item.title,
    source: item.source,
    category: TOPIC_LABELS[topic],
    publishedAt: new Date(item.publishedAt).toISOString(),
    url: item.link || '#',
  }
}

function dedupeItems(items: ParsedFeedItem[]): ParsedFeedItem[] {
  const seen = new Set<string>()
  const unique: ParsedFeedItem[] = []

  for (const item of items) {
    const titlePart = item.title.trim().toLowerCase()
    const linkPart = item.link.trim().toLowerCase()
    const dedupeKey = `${titlePart}|${linkPart}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    unique.push(item)
  }

  return unique
}

async function fetchRssText(url: string, signal: AbortSignal): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS)
  const abortListener = () => controller.abort()
  signal.addEventListener('abort', abortListener, { once: true })

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'User-Agent': 'Stratum/0.2 (+https://github.com/koala73/worldmonitor-inspired)',
      },
      signal: controller.signal,
    })

    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abortListener)
  }
}

async function fetchFeed(feed: ServerFeed, signal: AbortSignal): Promise<ParsedFeedItem[]> {
  const result = await cachedFetchWithFallback<ParsedFeedItem[]>({
    key: `rss:feed:v2:${feed.url}`,
    ttlSeconds: 600,
    staleMaxAgeMs: 6 * 60 * 60 * 1_000,
    fetcher: async () => {
      const text = await fetchRssText(feed.url, signal)
      if (!text) return null

      const parsed = parseFeedXml(text, feed.name)
      return parsed.length > 0 ? parsed : null
    },
  })

  return result.data ?? []
}

export function isNewsTopic(value: string): value is NewsTopic {
  return NEWS_TOPICS.includes(value as NewsTopic)
}

export async function fetchNewsItemsByTopic(
  topic: NewsTopic,
  limit = DEFAULT_MAX_ITEMS,
): Promise<NewsItem[]> {
  const feeds = NEWS_TOPIC_FEEDS[topic] ?? []
  if (feeds.length === 0) return []

  const deadlineController = new AbortController()
  const deadlineTimeout = setTimeout(() => deadlineController.abort(), OVERALL_DEADLINE_MS)

  try {
    const allItems: ParsedFeedItem[] = []

    for (let i = 0; i < feeds.length; i += BATCH_CONCURRENCY) {
      if (deadlineController.signal.aborted) break

      const batch = feeds.slice(i, i + BATCH_CONCURRENCY)
      const settled = await Promise.allSettled(
        batch.map(async (feed) => fetchFeed(feed, deadlineController.signal)),
      )

      for (const result of settled) {
        if (result.status === 'fulfilled') {
          allItems.push(...result.value)
        }
      }
    }

    const deduped = dedupeItems(allItems)
    deduped.sort((a, b) => b.publishedAt - a.publishedAt)

    return deduped.slice(0, limit).map((item) => toNewsItem(item, topic))
  } finally {
    clearTimeout(deadlineTimeout)
  }
}

export async function fetchAiNewsItems(limit = DEFAULT_MAX_ITEMS): Promise<NewsItem[]> {
  return fetchNewsItemsByTopic('general', limit)
}
