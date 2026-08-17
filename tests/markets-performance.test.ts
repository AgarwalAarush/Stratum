import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test('Markets shell does not wait for auth or snapshot data before streaming', () => {
  const layout = source('app/markets/layout.tsx')
  const shell = source('components/markets/MarketsShell.tsx')
  assert.equal(layout.includes('force-dynamic'), false)
  assert.equal(layout.includes('requireAllowedMarketUser'), false)
  assert.match(shell, /fetch\('\/api\/markets\/status'/)
  assert.match(shell, /Loading market status/)
})

test('Markets Overview has a durable read model with a live fallback', () => {
  const migration = source('supabase/migrations/202607310001_market_home_snapshots.sql')
  const repository = source('lib/server/markets-repository.ts')
  const materializer = source('lib/server/market-home.ts')
  const memo = source('lib/server/market-memo.ts')
  assert.match(migration, /create table if not exists public\.market_home_snapshots/)
  assert.match(repository, /loadPersistedMarketOverview/)
  assert.match(repository, /loadPersistedMarketOverview\(\) \?\? await composeLatestMarketOverview\(\)/)
  assert.match(materializer, /materializeMarketHomeSnapshot/)
  assert.match(memo, /await materializeMarketHomeSnapshot\(snapshotId\)/)
})

test('Markets Overview rehydrates post-close action data and republishes it after leadership completes', () => {
  const repository = source('lib/server/markets-repository.ts')
  const jobs = source('lib/server/agent-jobs.ts')

  assert.match(repository, /fetchLatestMarketLeadershipSummary\(\)/)
  assert.match(repository, /leadership: leadership \?\? overview\.leadership/)
  assert.match(repository, /candidateWeeklySummary: candidateWeeklySummary \?\? overview\.candidateWeeklySummary/)
  assert.match(jobs, /if \(job\.job_type === 'materialize-market-leadership'\) \{[\s\S]*?await materializeMarketHomeSnapshot\(\)/)
})

test('Markets Overview does not block its durable snapshot on live-feed collection', () => {
  const page = source('app/markets/page.tsx')
  const overview = source('components/markets/MarketsOverview.tsx')
  const liveContext = source('components/markets/MarketBriefNews.tsx')
  const route = source('app/api/markets/brief-news/route.ts')
  const service = source('lib/server/market-brief-news.ts')

  assert.doesNotMatch(page, /fetchMarketBriefNews/)
  assert.match(overview, /<MarketBriefNews relevantSymbols=/)
  assert.match(liveContext, /window\.setTimeout\(\(\) =>/)
  assert.match(route, /CACHE_TTL_SECONDS = 300/)
  assert.match(service, /cachedFetchWithFallback/)
  assert.match(service, /stratum:markets:brief-news:v1:/)
})

test('Markets Overview defers owner-specific thesis reads until after the snapshot paints', () => {
  const page = source('app/markets/page.tsx')
  const overview = source('components/markets/MarketsOverview.tsx')
  const thesisBrief = source('components/markets/MarketThesisBrief.tsx')
  const route = source('app/api/markets/thesis-brief/route.ts')

  assert.doesNotMatch(page, /fetchMarketThesisWorkspace/)
  assert.match(overview, /<MarketThesisBrief \/>/)
  assert.match(thesisBrief, /window\.setTimeout\(\(\) =>/)
  assert.match(route, /fetchMarketThesisWorkspace\(user\.id\)/)
})

test('Markets Events paints its shell before collecting live sources', () => {
  const page = source('app/markets/events/page.tsx')
  const feed = source('components/markets/MarketEventsFeed.tsx')
  const route = source('app/api/markets/events/route.ts')
  const service = source('lib/server/market-events.ts')

  assert.doesNotMatch(page, /fetchFinanceDeals|fetchPortfolioWorkspace/)
  assert.match(page, /<MarketEventsFeed focusedSymbol=/)
  assert.match(feed, /window\.setTimeout\(\(\) =>/)
  assert.match(feed, /loading=\{items === null\}/)
  assert.match(route, /fetchPortfolioEventSymbols\(user\.id\)/)
  assert.match(service, /cachedFetchWithFallback/)
  assert.match(service, /stratum:markets:events:v1:/)
})

test('Portfolio loads its workspace once and reprices the loaded data', () => {
  const page = source('app/markets/portfolio/page.tsx')
  const portfolio = source('lib/server/portfolio.ts')

  assert.equal((page.match(/fetchPortfolioWorkspace\(user\.id\)/g) ?? []).length, 1)
  assert.match(page, /applyPortfolioQuotes\(initialData/)
  assert.match(portfolio, /export function applyPortfolioQuotes/)
  assert.match(portfolio, /export async function fetchPortfolioEventSymbols/)
})

test('Intelligence pages server-seed one scope payload and lazy-load optional UI', () => {
  const scopePage = source('app/(intelligence)/[scope]/page.tsx')
  const scopeFeed = source('components/sections/ScopeFeed.tsx')
  const scopeRoute = source('app/api/scopes/[scope]/route.ts')
  const layout = source('components/layout/ClientLayout.tsx')
  const section = source('components/sections/ScopeSection.tsx')
  assert.match(scopePage, /fetchScopeFeedPayload\(scope\.id\)/)
  assert.match(scopeFeed, /fallbackData: initialData/)
  assert.match(scopeFeed, /fetch\(`\/api\/scopes\/\$\{scopeId\}`/)
  assert.match(scopeRoute, /fetchScopeFeedPayload\(scope\)/)
  assert.match(layout, /dynamic\(\(\) => import\('\.\/SettingsModal'\)/)
  assert.match(layout, /dynamic\(\(\) => import\('\@\/components\/IntelligenceBriefingsModal'\)/)
  assert.match(layout, /\{isIntelligenceBriefingsOpen \? \(/)
  assert.match(section, /dynamic\(\(\) => import\('\@\/components\/SummaryCard'\)/)
})
