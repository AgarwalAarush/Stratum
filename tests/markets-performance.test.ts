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
