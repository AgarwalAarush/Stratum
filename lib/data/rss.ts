import type { NewsItem } from '../types.ts'
import { cachedFetchWithFallback } from '../server/cache.ts'
import { parseFeedXml, type ParsedFeedItem } from './rss-parser.ts'
import { cachedDecodeGoogleNewsUrl } from './scrapers/registry.ts'

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
  | 'geopolitics'
  | 'european-union'
  | 'climate-environment'
  | 'global-supply-chains'
  | 'global-summits'
  | 'global-health'

const FEED_TIMEOUT_MS = 8_000
const OVERALL_DEADLINE_MS = 25_000
const BATCH_CONCURRENCY = 20
const DEFAULT_MAX_ITEMS = 20

const gn = (query: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`

const SOURCE_HOST_ALIASES: Record<string, string> = {
  'aljazeera.com': 'Al Jazeera',
  'apnews.com': 'AP News',
  'arstechnica.com': 'Ars Technica',
  'bloomberg.com': 'Bloomberg',
  'carbonbrief.org': 'Carbon Brief',
  'euractiv.com': 'Euractiv',
  'foreignaffairs.com': 'Foreign Affairs',
  'ft.com': 'Financial Times',
  'reuters.com': 'Reuters',
  'technologyreview.com': 'MIT Technology Review',
  'theguardian.com': 'The Guardian',
  'theverge.com': 'The Verge',
  'techcrunch.com': 'TechCrunch',
  'wired.com': 'Wired',
  'wsj.com': 'WSJ',
}

export const NEWS_TOPICS: NewsTopic[] = [
  'general',
  'cybersecurity',
  'venture-capital',
  'policy',
  'new-technology',
  'startups',
  'infra-hardware',
  'tech-events',
  'geopolitics',
  'european-union',
  'climate-environment',
  'global-supply-chains',
  'global-summits',
  'global-health',
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
  geopolitics: 'Geopolitics & Conflicts',
  'european-union': 'European Union',
  'climate-environment': 'Climate & Environment',
  'global-supply-chains': 'Global Supply Chains',
  'global-summits': 'Global Summits & Conferences',
  'global-health': 'Global Health',
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
  geopolitics: [
    { name: 'Reuters World', url: gn('site:reuters.com geopolitics OR war OR conflict when:3d') },
    { name: 'AP World', url: gn('site:apnews.com war OR conflict OR geopolitics when:3d') },
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { name: 'Foreign Affairs', url: gn('site:foreignaffairs.com when:14d') },
    { name: 'CSIS', url: gn('site:csis.org when:7d') },
    { name: 'Geopolitical Tensions', url: gn('(geopolitical tensions OR military conflict OR territorial dispute OR sanctions) when:3d') },
    { name: 'Wars & Conflicts', url: gn('(war OR armed conflict OR ceasefire OR peace talks) when:3d') },
  ],
  'european-union': [
    { name: 'Euractiv', url: 'https://www.euractiv.com/feed/' },
    { name: 'Politico EU', url: gn('site:politico.eu when:3d') },
    { name: 'EU Policy', url: gn('("European Union" OR "European Commission" OR "European Parliament" OR ECB) policy when:3d') },
    { name: 'EU Regulation', url: gn('("EU regulation" OR "EU directive" OR "European Council") when:7d') },
    { name: 'ECB Policy', url: gn('("European Central Bank" OR ECB OR "euro zone" monetary policy) when:7d') },
  ],
  'climate-environment': [
    { name: 'Carbon Brief', url: 'https://www.carbonbrief.org/feed/' },
    { name: 'Guardian Climate', url: 'https://www.theguardian.com/environment/climate-crisis/rss' },
    { name: 'Climate Change', url: gn('("climate change" OR "global warming" OR "climate crisis") when:3d') },
    { name: 'Energy Transition', url: gn('("energy transition" OR "renewable energy" OR "clean energy" OR "net zero") when:7d') },
    { name: 'Climate Policy', url: gn('("climate policy" OR "carbon emissions" OR "Paris Agreement" OR "climate legislation") when:7d') },
  ],
  'global-supply-chains': [
    { name: 'Supply Chain News', url: gn('("supply chain" disruption OR crisis OR shortage) when:3d') },
    { name: 'Trade & Tariffs', url: gn('(tariffs OR "trade war" OR "trade deal" OR "trade policy") when:3d') },
    { name: 'Shipping & Logistics', url: gn('(shipping OR logistics OR "freight rates" OR "port congestion" OR "container shipping") when:7d') },
    { name: 'Commodities', url: gn('(commodities OR "oil prices" OR "rare earth" OR "critical minerals") when:3d') },
    { name: 'Global Trade', url: gn('("global trade" OR WTO OR "trade agreement" OR export OR import) when:7d') },
  ],
  'global-summits': [
    { name: 'G7 G20', url: gn('(G7 OR G20 summit OR meeting) when:14d') },
    { name: 'United Nations', url: gn('("United Nations" OR "UN General Assembly" OR "UN Security Council") when:7d') },
    { name: 'WEF Davos', url: gn('("World Economic Forum" OR WEF OR Davos) when:14d') },
    { name: 'COP Climate', url: gn('("COP28" OR "COP29" OR "COP30" OR "climate summit") when:14d') },
    { name: 'NATO', url: gn('(NATO summit OR meeting OR alliance) when:7d') },
    { name: 'Global Conferences', url: gn('("global summit" OR "international conference" OR "world leaders" summit) when:7d') },
  ],
  'global-health': [
    { name: 'WHO News', url: gn('("World Health Organization" OR WHO) when:3d') },
    { name: 'Pandemic Watch', url: gn('(pandemic OR epidemic OR "disease outbreak" OR "public health emergency") when:7d') },
    { name: 'Global Health Policy', url: gn('("global health" policy OR "health crisis" OR "vaccine" OR "health equity") when:7d') },
    { name: 'Infectious Disease', url: gn('("infectious disease" OR "bird flu" OR mpox OR "drug resistant") when:7d') },
  ],
}

function getHostname(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname
  } catch {
    return null
  }
}

function normalizeSourceName(value: string | undefined): string | undefined {
  if (!value) return undefined

  const normalized = value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^the\s+/i, 'The ')

  if (!normalized) return undefined

  const lower = normalized.toLowerCase()
  if (lower.includes('associated press') || lower === 'ap' || lower.includes('ap news')) return 'AP News'
  if (lower.includes('ars technica')) return 'Ars Technica'
  if (lower.includes('bloomberg')) return 'Bloomberg'
  if (lower.includes('financial times') || lower === 'ft') return 'Financial Times'
  if (lower.includes('mit technology review') || lower.includes('technology review')) return 'MIT Technology Review'
  if (lower.includes('reuters')) return 'Reuters'
  if (lower.includes('techcrunch')) return 'TechCrunch'
  if (lower.includes('the verge') || lower === 'verge') return 'The Verge'
  if (lower.includes('wall street journal') || lower === 'wsj') return 'WSJ'
  if (lower.includes('wired')) return 'Wired'

  return normalized
}

function resolveCanonicalSource(item: ParsedFeedItem): string {
  const normalizedPublisher = normalizeSourceName(item.publisher)
  if (normalizedPublisher) return normalizedPublisher

  const publisherHost = item.publisherUrl ? getHostname(item.publisherUrl) : null
  if (publisherHost && SOURCE_HOST_ALIASES[publisherHost]) {
    return SOURCE_HOST_ALIASES[publisherHost]
  }

  const effectiveLink = item.resolvedLink || item.link
  const linkHost = effectiveLink ? getHostname(effectiveLink) : null
  if (linkHost && SOURCE_HOST_ALIASES[linkHost]) {
    return SOURCE_HOST_ALIASES[linkHost]
  }

  if (linkHost && linkHost !== 'news.google.com') {
    return linkHost
  }

  return normalizeSourceName(item.source) ?? item.source
}

function toNewsItem(item: ParsedFeedItem, topic: NewsTopic): NewsItem {
  return {
    type: 'news',
    id: item.id,
    title: item.title,
    source: item.source,
    feedName: item.source,
    publisher: normalizeSourceName(item.publisher),
    canonicalSource: resolveCanonicalSource(item),
    topic,
    category: TOPIC_LABELS[topic],
    publishedAt: new Date(item.publishedAt).toISOString(),
    url: item.resolvedLink || item.link || '#',
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

const RESOLVE_TIMEOUT_MS = 12_000
const RESOLVE_BATCH_SIZE = 5

async function resolveGoogleNewsUrls(items: ParsedFeedItem[]): Promise<void> {
  const googleItems = items.filter(i => i.link?.includes('news.google.com'))
  if (googleItems.length === 0) return

  const deadline = AbortSignal.timeout(RESOLVE_TIMEOUT_MS)

  for (let i = 0; i < googleItems.length; i += RESOLVE_BATCH_SIZE) {
    if (deadline.aborted) break
    const batch = googleItems.slice(i, i + RESOLVE_BATCH_SIZE)
    await Promise.allSettled(
      batch.map(async (item) => {
        const resolved = await cachedDecodeGoogleNewsUrl(item.link)
        if (resolved) item.resolvedLink = resolved
      })
    )
  }
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
    key: `rss:feed:v3:${feed.url}`,
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

    const final = deduped.slice(0, limit)
    await resolveGoogleNewsUrls(final)
    return final.map((item) => toNewsItem(item, topic))
  } finally {
    clearTimeout(deadlineTimeout)
  }
}

export async function fetchAiNewsItems(limit = DEFAULT_MAX_ITEMS): Promise<NewsItem[]> {
  return fetchNewsItemsByTopic('general', limit)
}
