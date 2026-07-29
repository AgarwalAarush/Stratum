import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test('Markets navigation exposes workflow destinations and removes the old taxonomy', () => {
  const shell = source('components/markets/MarketsShell.tsx')
  for (const label of ['Overview', 'Explore', 'Portfolio', 'Research', 'Events']) {
    assert.match(shell, new RegExp(`label: '${label}'`))
  }
  for (const label of ['Screener', 'Macro', 'News', 'Watchlists']) {
    assert.equal(shell.includes(`label: '${label}'`), false)
  }
})

test('legacy routes preserve compatibility through explicit redirects', () => {
  assert.match(source('app/markets/screener/page.tsx'), /redirect\('\/markets\/explore\?view=stocks'\)/)
  assert.match(source('app/markets/news/page.tsx'), /redirect\('\/markets\/events'\)/)
  assert.match(source('app/markets/macro/page.tsx'), /redirect\('\/markets#macro-pulse'\)/)
})

test('ticker surfaces converge on the canonical Stock Viewer route', () => {
  const screener = source('components/markets/MarketsScreener.tsx')
  const watchlists = source('components/markets/MarketsWatchlists.tsx')
  const viewer = source('components/markets/StockViewer.tsx')
  assert.match(screener, /href=\{`\/markets\/stocks\/\$\{row\.symbol\}`\}/)
  assert.match(watchlists, /href=\{`\/markets\/stocks\/\$\{row\.symbol\}`\}/)
  assert.match(viewer, /Decision, not execution/)
  assert.match(viewer, /Formal rating/)
  assert.match(viewer, /Entry action/)
  assert.match(viewer, /Kill criteria/)
})

test('Stock Viewer supports intercepted desktop routing and a canonical deep link', () => {
  assert.match(source('app/markets/stocks/[symbol]/page.tsx'), /<StockViewer data=\{data\}/)
  assert.match(source('app/markets/@modal/(.)stocks/[symbol]/page.tsx'), /<StockViewerModal/)
  assert.match(source('components/markets/StockViewerModal.tsx'), /router\.back\(\)/)
  assert.match(source('components/markets/StockViewerModal.tsx'), /event\.key === 'Escape'/)
})
