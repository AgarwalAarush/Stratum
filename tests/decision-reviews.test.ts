import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('decision reviews version theses and preserve original price context', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202607280004_decision_reviews.sql', import.meta.url), 'utf8')
  assert.match(sql, /add column if not exists version integer/i)
  assert.match(sql, /add column if not exists price_at_decision numeric/i)
  assert.match(sql, /row_number\(\) over/i)
  assert.match(sql, /create table if not exists public\.decision_reviews/i)
  assert.match(sql, /unique \(owner_id, decision_id\)/i)
  assert.match(sql, /enable row level security/i)
})

test('portfolio history supports expectation comparisons and postmortems', async () => {
  const component = await readFile(new URL('../components/markets/PortfolioWorkspace.tsx', import.meta.url), 'utf8')
  const route = await readFile(new URL('../app/api/markets/portfolio/route.ts', import.meta.url), 'utf8')
  assert.match(component, /Original expectation/)
  assert.match(component, /Observed outcome/)
  assert.match(component, /Postmortem/)
  assert.match(component, /Review outcome/)
  assert.match(route, /save-review/)
  assert.match(route, /saveDecisionReview/)
})
