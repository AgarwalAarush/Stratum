import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LEGACY_SAVED_SCREEN_STORAGE_KEY,
  parseSavedScreenName,
  parseSavedScreenerQuery,
  parseSavedScreenerScreens,
  SAVED_SCREENS_STORAGE_KEY,
} from '../lib/markets/saved-screens.ts'

const query = {
  preset: 'near-highs',
  filters: [{ id: 'price', field: 'price', operator: 'gt', value: 10, label: 'Price > $10' }],
  sort: 'fiftyTwoWeekPosition',
  direction: 'desc',
}

test('saved screener queries preserve screen-defining conditions but not pagination', () => {
  assert.deepEqual(parseSavedScreenerQuery({ ...query, page: 4, pageSize: 5 }), query)
  assert.equal(SAVED_SCREENS_STORAGE_KEY, 'stratum:markets:saved-screens:v1')
  assert.equal(LEGACY_SAVED_SCREEN_STORAGE_KEY, 'stratum:markets:saved-screen:v1')
})

test('saved screens sanitize stale browser entries and screen names', () => {
  const screens = parseSavedScreenerScreens({
    screens: [
      { id: 'growth', name: '  Growth   pullbacks ', query, createdAt: '2026-07-31T00:00:00Z', updatedAt: '2026-07-31T00:00:00Z' },
      { id: 'growth', name: 'Duplicate', query, createdAt: '2026-07-31T00:00:00Z', updatedAt: '2026-07-31T00:00:00Z' },
      { id: 'broken', name: 'Broken', query: { ...query, sort: 'not-a-sort' }, createdAt: '2026-07-31T00:00:00Z', updatedAt: '2026-07-31T00:00:00Z' },
    ],
  })

  assert.equal(screens.length, 1)
  assert.equal(screens[0]?.name, 'Growth pullbacks')
  assert.throws(() => parseSavedScreenName(' '.repeat(49)), /Screen name is required/)
  assert.throws(() => parseSavedScreenName('A'.repeat(49)), /48 characters or fewer/)
})

test('saved screens use account-backed storage and explicit screen-management controls', () => {
  const component = readFileSync(join(process.cwd(), 'components/markets/MarketsScreener.tsx'), 'utf8')
  const route = readFileSync(join(process.cwd(), 'app/api/markets/saved-screens/route.ts'), 'utf8')
  const persistence = readFileSync(join(process.cwd(), 'lib/server/saved-screens.ts'), 'utf8')
  const migration = readFileSync(join(process.cwd(), 'supabase/migrations/202607310002_saved_screener_screens.sql'), 'utf8')

  assert.match(component, /Your screens/)
  assert.match(component, /Save as new/)
  assert.match(component, /Save changes/)
  assert.match(component, /Rename/)
  assert.match(component, /Confirm delete/)
  assert.match(component, /api\/markets\/saved-screens/)
  assert.match(route, /getAllowedMarketUser/)
  assert.match(route, /body\.action === 'create'/)
  assert.match(route, /body\.action === 'update'/)
  assert.match(route, /body\.action === 'delete'/)
  assert.match(persistence, /\.eq\('owner_id', ownerId\)/)
  assert.match(migration, /create table if not exists public\.saved_screener_screens/)
  assert.match(migration, /references public\.market_users\(id\) on delete cascade/)
})
