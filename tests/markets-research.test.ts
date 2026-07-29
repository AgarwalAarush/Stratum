import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('research library is authenticated, versioned, and source-backed', async () => {
  const source = await readFile(new URL('../app/markets/research/page.tsx', import.meta.url), 'utf8')
  const route = await readFile(new URL('../app/api/markets/research/route.ts', import.meta.url), 'utf8')
  const report = await readFile(new URL('../app/markets/stocks/[symbol]/research/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /requireAllowedMarketUser/)
  assert.match(source, /fetchEquityResearchLibrary/)
  assert.match(source, /Immutable research versions/)
  assert.match(source, /fetchFinanceReports/)
  assert.match(route, /\^\[A-Z\]\[A-Z0-9.-\]/)
  assert.match(route, /generate-company-research/)
  assert.match(report, /research\.sections\.map/)
})
