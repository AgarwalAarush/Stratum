import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createDefaultWatchlistState,
  ensureEnergyWatchlist,
  isValidWatchlistSymbol,
  parseWatchlistState,
  updateWatchlist,
  WATCHLIST_STORAGE_KEY,
} from '../lib/markets/watchlists.ts'

test('watchlists default to an Energy starter list alongside a useful core list', () => {
  const state = createDefaultWatchlistState(['MSFT', 'AAPL', 'NVDA', 'TSLA', 'AMZN', 'GOOGL'])
  assert.equal(WATCHLIST_STORAGE_KEY, 'stratum:markets:watchlists:v1')
  assert.equal(state.activeListId, 'energy')
  assert.deepEqual(state.lists[0], { id: 'energy', name: 'Energy', symbols: ['GRID', 'MLPX', 'NLR', 'PAVE', 'PIKA', 'RACK', 'URA', 'UTES', 'XLU'] })
  assert.deepEqual(state.lists[1]?.symbols, ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL'])
})

test('Energy is added to existing workspaces without replacing saved lists', () => {
  const state = ensureEnergyWatchlist({
    version: 1,
    activeListId: 'core',
    lists: [{ id: 'core', name: 'Core', symbols: ['AAPL'] }],
  })
  assert.equal(state.activeListId, 'energy')
  assert.equal(state.lists[0]?.name, 'Energy')
  assert.deepEqual(state.lists[1], { id: 'core', name: 'Core', symbols: ['AAPL'] })
})

test('watchlist parser sanitizes stored browser state', () => {
  const fallback = createDefaultWatchlistState(['AAPL'])
  const parsed = parseWatchlistState({
    activeListId: 'ideas',
    lists: [
      { id: 'ideas', name: ' Ideas ', symbols: ['aapl', 'AAPL', ' brk.b ', 'bad ticker'] },
      { id: '', name: 'Invalid', symbols: [] },
    ],
  }, fallback)

  assert.equal(parsed.activeListId, 'ideas')
  assert.equal(parsed.lists[0]?.name, 'Ideas')
  assert.deepEqual(parsed.lists[0]?.symbols, ['AAPL', 'BRK.B'])
})

test('watchlist updates stay scoped to the active list', () => {
  const state = {
    version: 1 as const,
    activeListId: 'core',
    lists: [
      { id: 'core', name: 'Core', symbols: ['AAPL'] },
      { id: 'ideas', name: 'Ideas', symbols: ['PLTR'] },
    ],
  }
  const updated = updateWatchlist(state, 'ideas', (list) => ({ ...list, symbols: [...list.symbols, 'NVDA'] }))
  assert.deepEqual(updated.lists[0]?.symbols, ['AAPL'])
  assert.deepEqual(updated.lists[1]?.symbols, ['PLTR', 'NVDA'])
  assert.equal(isValidWatchlistSymbol('BRK.B'), true)
  assert.equal(isValidWatchlistSymbol('bad ticker'), false)
})

test('watchlists live inside Explore and the legacy route preserves the destination', () => {
  const legacyPage = readFileSync(join(process.cwd(), 'app/markets/watchlists/page.tsx'), 'utf8')
  const page = readFileSync(join(process.cwd(), 'app/markets/explore/page.tsx'), 'utf8')
  const component = readFileSync(join(process.cwd(), 'components/markets/MarketsWatchlists.tsx'), 'utf8')
  const explore = readFileSync(join(process.cwd(), 'components/markets/MarketsExplore.tsx'), 'utf8')
  const workspace = readFileSync(join(process.cwd(), 'components/markets/PortfolioWorkspace.tsx'), 'utf8')
  assert.match(legacyPage, /redirect\('\/markets\/explore\?view=watchlists'\)/)
  assert.match(page, /fetchPortfolioWorkspace/)
  assert.match(explore, /\['watchlists', 'Watchlists'\]/)
  assert.match(explore, /<MarketsWatchlists/)
  assert.match(component, /localStorage\.setItem\(WATCHLIST_STORAGE_KEY/)
  assert.match(component, /replace-watchlists/)
  assert.match(component, /ensureEnergyWatchlist/)
  assert.match(component, /createList/)
  assert.match(component, /removeSymbol/)
  assert.match(component, /Search symbol or company/)
  assert.match(workspace, /portfolio-alert-list/)
  assert.match(workspace, /initialData\.decisionHistory\.map/)
})

test('server watchlist persistence remains owner-scoped without relying on a partial-index upsert', () => {
  const source = readFileSync(join(process.cwd(), 'lib/server/portfolio.ts'), 'utf8')
  const replacement = source.slice(source.indexOf('export async function replaceUserWatchlists'), source.indexOf('export async function upsertManualPosition'))
  assert.match(replacement, /\.eq\('owner_id', ownerId\)/)
  assert.match(replacement, /\.eq\('client_id', list\.id\)/)
  assert.match(replacement, /existingList[\s\S]*\.update\(/)
  assert.match(replacement, /\.insert\(/)
  assert.doesNotMatch(replacement, /onConflict:\s*'owner_id,client_id'/)
  assert.match(replacement, /ensureWatchlistAssets/)
  assert.match(source, /fetchAsset\(symbol\)/)
})
