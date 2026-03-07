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
  NEWS_HOT_TIER2_AGE_MS: 12 * 60 * 60 * 1000,
  NEWS_VERY_FRESH_MAX_AGE_MS: 45 * 60 * 1000,
} as const

// ─── News patterns ───

const SECURITY_BREAKING_RE = /breach|hack(?!athon)(ed|ing)?|ransomware|zero.?day|cyber.?attack|exploit|outage|emergency|critical vulnerability|fatal|leaked/
const POLICY_BREAKING_RE = /\bban(ned)?\b|\bfine[ds]?\b|\bprobe\b|\binvestigation\b|\blawsuit\b|\bsue[ds]?\b|\bindict(ed|ment)?\b|\benforcement\b|\bsuspend(ed|s)?\b|\bblocked?\b|\bshutdown\b|\bemergency\b/
const GENERIC_NEW_RE = /\blaunch(es|ed)?\b|\bannounce(s|d|ment)\b|\brelease(s|d)?\b|\bunveil(s|ed)?\b|\bintroduce(s|d)\b|\bdebut(s|ed)?\b|\bpreview\b|\bbeta\b|\bearly access\b|\bnow available\b|\bjust announced\b/
const GENERAL_ENTITY_RE = /\b(openai|anthropic|google ai|gemini|deepseek|mistral|qwen|chatgpt|claude|gpt-[a-z0-9.]+|ai|model|assistant|agent|api|sdk)\b/
const GENERAL_RELEASE_RE = /\brolls?\s+out\b|\brollout\b|\bupgrade(s|d)?\b|\bopen[- ]source[ds]?\b|\bpreview\b|\bbeta\b|\bearly access\b|\bgenerally available\b|\bnow available\b|\bapi access\b|\bsdk\b|\bavailability\b/
const GENERAL_HOT_RE = /\bbreakthrough\b|\bmilestone\b|\brecord\b|\bbenchmark\b|\breasoning\b|\bpartnership\b|\bstate[- ]of[- ]the[- ]art\b|\bsurpass(es|ed)?\b/
const POLICY_HOT_RE = /\bproposal\b|\bproposed\b|\bdraft\b|\bguidance\b|\brule\b|\brulemaking\b|\bconsultation\b|\bframework\b|\bcompliance\b|\bdeadline\b|\bhearing\b|\bvote\b|\badopt(s|ed)?\b|\bai act\b|\bftc\b|\bdoj\b|\bnist\b|\bwhite house\b|\bparliament\b|\bcommission\b/
const VENTURE_HOT_RE = /\$\d+[bm]|\bbillion\b|\bipo\b|acqui(res|red|sition)|partnership|surpass(es|ed)?|record|milestone|breakthrough|trillion|valuation|funding|raise[ds]?\s*\$|\bseries [a-z]\b|\bseed round\b|\bventure round\b|\bunicorn\b/
const VENTURE_NEW_RE = /\bnew fund\b|\blaunch(es|ed)? (an |its )?fund\b|\bseed round\b|\bseries [a-z]\b/

// ─── Source tiers ───

const TIER_1 = ['Reuters', 'Bloomberg', 'WSJ', 'Financial Times', 'AP News']
const TIER_2 = ['The Verge', 'TechCrunch', 'Ars Technica', 'MIT Technology Review', 'Wired']

function isSourceTier(source: string, tier: string[]): boolean {
  return tier.some(t => source.includes(t))
}

function inferNewsTopic(item: FeedItem & { type: 'news' }): string | undefined {
  if (item.topic) return item.topic

  const category = item.category?.toLowerCase() ?? ''
  if (category.includes('policy')) return 'policy'
  if (category.includes('venture capital')) return 'venture-capital'
  if (category.includes('general ai news')) return 'general'
  if (/(^|\b)(m&a|ipo|funding|deals?)(\b|$)/.test(category)) return 'venture-capital'
  return undefined
}

function getCanonicalSource(item: FeedItem & { type: 'news' }): string {
  return item.canonicalSource ?? item.publisher ?? item.feedName ?? item.source
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
  const topic = inferNewsTopic(item)
  const canonicalSource = getCanonicalSource(item)
  const isBreakingFresh = ageMs < TAG_THRESHOLDS.BREAKING_MAX_AGE_MS
  const isRecent = ageMs < TAG_THRESHOLDS.NEW_MAX_AGE_MS
  const isVeryFresh = ageMs < TAG_THRESHOLDS.NEWS_VERY_FRESH_MAX_AGE_MS
  const isTier1Recent = isSourceTier(canonicalSource, TIER_1) && ageMs < TAG_THRESHOLDS.NEWS_HOT_TIER1_AGE_MS
  const isTier2Recent = isSourceTier(canonicalSource, TIER_2) && ageMs < TAG_THRESHOLDS.NEWS_HOT_TIER2_AGE_MS
  const matchesGeneralRelease = GENERIC_NEW_RE.test(title) || GENERAL_RELEASE_RE.test(title)
  const matchesGeneralHot = GENERAL_HOT_RE.test(title)
  const matchesPolicyHot = POLICY_HOT_RE.test(title)
  const matchesVentureHot = VENTURE_HOT_RE.test(title)

  if (SECURITY_BREAKING_RE.test(title)) return 'breaking'
  if ((topic === 'policy' || matchesPolicyHot || isTier1Recent) && POLICY_BREAKING_RE.test(title) && isBreakingFresh) {
    return 'breaking'
  }

  if (matchesVentureHot) return 'hot'

  if ((topic === 'policy' || matchesPolicyHot) && matchesPolicyHot && (isRecent || isTier1Recent)) {
    return 'hot'
  }

  if (
    (topic === 'general' || matchesGeneralHot || matchesGeneralRelease) &&
    matchesGeneralHot &&
    (isRecent || isTier1Recent || isTier2Recent)
  ) {
    return 'hot'
  }

  if (matchesGeneralRelease && GENERAL_ENTITY_RE.test(title) && isTier1Recent) {
    return 'hot'
  }

  if ((topic === 'general' || matchesGeneralRelease) && matchesGeneralRelease && (isRecent || isTier2Recent)) {
    return 'new'
  }

  if ((topic === 'policy' || matchesPolicyHot) && matchesPolicyHot && isRecent) {
    return 'new'
  }

  if (VENTURE_NEW_RE.test(title) && isRecent) return 'new'
  if (GENERIC_NEW_RE.test(title) && isRecent) return 'new'
  if (isVeryFresh) return 'new'

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
