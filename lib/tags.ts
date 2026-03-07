import type { FeedItem, ItemTag } from '@/lib/types'

// ─── Thresholds ───

const TAG_THRESHOLDS = {
  NEW_MAX_AGE_MS:      3 * 60 * 60 * 1000,   // 3 hours
  BREAKING_MAX_AGE_MS: 1 * 60 * 60 * 1000,   // 1 hour

  // Discussions
  DISC_HOT_POINTS:     300,
  DISC_HOT_COMMENTS:   200,
  DISC_VELOCITY_PTS:   150,
  DISC_NEW_MIN_PTS:    50,

  // Repos
  REPO_HOT_STARS_DAY:  10,
  REPO_HOT_ESTABLISHED_STARS_DAY: 5,
  REPO_HOT_TOTAL_STARS: 5000,
  REPO_NEW_STARS_DAY:  3,
  REPO_NEW_MAX_TOTAL:  200,

  // Papers
  PAPER_NEW_MAX_AGE_MS: 24 * 60 * 60 * 1000,

  // Earnings
  EARNINGS_SURPRISE_PCT: 10,

  // News
  NEWS_HOT_TIER1_AGE_MS: 6 * 60 * 60 * 1000,
} as const

// ─── News patterns ───

const BREAKING_RE = /breach|hack(?!athon)(ed|ing)?|ransomware|zero.?day|cyber.?attack|exploit|outage|emergency|ban(ned)?|shutdown|critical|urgent|fatal|recall|suspend(ed|s)?|investigation|indict|lawsuit|leaked/
const NEW_RE = /launch(es|ed)?|announc(es|ed|ement)|releas(es|ed)|unveil(s|ed)?|introduc(es|ed)|debut(s|ed)?|now available|preview|beta|early access|open.source(d)?|first look|just.announced/
const HOT_RE = /\$\d+[bm]|\bbillion\b|\bIPO\b|acqui(res|red|sition)|partnership|surpass(es|ed)?|record|milestone|breakthrough|trillion|valuation|funding|raise[ds]?\s*\$/

// ─── Source tiers ───

const TIER_1 = ['Reuters', 'Bloomberg', 'WSJ', 'Financial Times', 'AP News']
const TIER_2 = ['The Verge', 'TechCrunch', 'Ars Technica', 'MIT Technology Review', 'Wired']

function isSourceTier(source: string, tier: string[]): boolean {
  return tier.some(t => source.includes(t))
}

// ─── Per-type tag helpers ───

function getDiscussionTag(item: FeedItem & { type: 'discussion' }): ItemTag | undefined {
  const ageMs = Date.now() - new Date(item.publishedAt).getTime()
  const isRecent = ageMs < TAG_THRESHOLDS.NEW_MAX_AGE_MS

  if (item.points >= TAG_THRESHOLDS.DISC_HOT_POINTS) return 'hot'
  if (item.commentCount >= TAG_THRESHOLDS.DISC_HOT_COMMENTS) return 'hot'
  if (item.points >= TAG_THRESHOLDS.DISC_VELOCITY_PTS && isRecent) return 'hot'
  if (isRecent && item.points >= TAG_THRESHOLDS.DISC_NEW_MIN_PTS) return 'new'
  return undefined
}

function getPaperTag(item: FeedItem & { type: 'paper' }): ItemTag | undefined {
  if (item.id.startsWith('alphaxiv-')) return 'hot'
  const ageMs = Date.now() - new Date(item.publishedAt).getTime()
  if (ageMs < TAG_THRESHOLDS.PAPER_NEW_MAX_AGE_MS) return 'new'
  return undefined
}

function getRepoTag(item: FeedItem & { type: 'repo' }): ItemTag | undefined {
  if (item.starsPerDay >= TAG_THRESHOLDS.REPO_HOT_STARS_DAY) return 'hot'
  if (item.starsPerDay >= TAG_THRESHOLDS.REPO_HOT_ESTABLISHED_STARS_DAY &&
      item.totalStars >= TAG_THRESHOLDS.REPO_HOT_TOTAL_STARS) return 'hot'
  if (item.starsPerDay >= TAG_THRESHOLDS.REPO_NEW_STARS_DAY &&
      item.totalStars < TAG_THRESHOLDS.REPO_NEW_MAX_TOTAL) return 'new'
  return undefined
}

function getEarningsTag(item: FeedItem & { type: 'earnings' }): ItemTag | undefined {
  const hasEps = item.epsActual !== undefined && item.epsEstimate !== undefined && item.epsEstimate !== 0
  const surprisePct = hasEps
    ? Math.abs((item.epsActual! - item.epsEstimate!) / Math.abs(item.epsEstimate!)) * 100
    : 0

  if (item.beat === false && surprisePct > TAG_THRESHOLDS.EARNINGS_SURPRISE_PCT) return 'breaking'
  if (item.beat === true && surprisePct > TAG_THRESHOLDS.EARNINGS_SURPRISE_PCT) return 'hot'
  if (item.beat === true) return 'verified'
  return undefined
}

function getNewsTag(item: FeedItem & { type: 'news' }): ItemTag | undefined {
  const title = item.title.toLowerCase()
  const ageMs = item.publishedAt ? Date.now() - new Date(item.publishedAt).getTime() : Infinity
  const isBreakingFresh = ageMs < TAG_THRESHOLDS.BREAKING_MAX_AGE_MS
  const isRecent = ageMs < TAG_THRESHOLDS.NEW_MAX_AGE_MS

  // BREAKING: pattern match + fresh, or high-urgency patterns regardless
  if (BREAKING_RE.test(title) && isBreakingFresh) return 'breaking'
  if (/zero.?day|cyber.?attack|ransomware|emergency/.test(title)) return 'breaking'

  // HOT: financial patterns, or tier-1 source + recent
  if (HOT_RE.test(title)) return 'hot'
  if (isSourceTier(item.source, TIER_1) && ageMs < TAG_THRESHOLDS.NEWS_HOT_TIER1_AGE_MS) return 'hot'

  // NEW: pattern match + recent, or anything very fresh
  if (NEW_RE.test(title) && isRecent) return 'new'
  if (isBreakingFresh) return 'new'

  return undefined
}

// ─── Main dispatcher ───

export function getTag(item: FeedItem): ItemTag | undefined {
  switch (item.type) {
    case 'discussion': return getDiscussionTag(item)
    case 'paper':      return getPaperTag(item)
    case 'repo':       return getRepoTag(item)
    case 'earnings':   return getEarningsTag(item)
    case 'news':       return getNewsTag(item)
  }
}
