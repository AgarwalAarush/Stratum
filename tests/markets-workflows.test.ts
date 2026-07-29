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
  const decisionRail = source('components/markets/CapitalDecisionRail.tsx')
  assert.match(screener, /router\.push\(`\/markets\/stocks\/\$\{symbol\}`/)
  assert.match(screener, /className="market-screen-stock-row"[\s\S]*role="link"/)
  assert.match(watchlists, /href=\{`\/markets\/stocks\/\$\{row\.symbol\}`\}/)
  assert.match(decisionRail, /Decision, not execution/)
  assert.match(decisionRail, /Formal rating/)
  assert.match(decisionRail, /Entry action/)
  assert.match(decisionRail, /Kill criteria/)
  assert.match(viewer, /Read full analysis/)
})

test('Stock Viewer supports intercepted desktop routing and a canonical deep link', () => {
  assert.match(source('app/markets/stocks/[symbol]/page.tsx'), /<StockViewer data=\{data\}/)
  assert.match(source('app/markets/@modal/(.)stocks/[symbol]/page.tsx'), /<StockViewerModal/)
  assert.match(source('components/markets/StockViewerModal.tsx'), /router\.back\(\)/)
  assert.match(source('components/markets/StockViewerModal.tsx'), /event\.key === 'Escape'/)
})

test('Stock Viewer chart is interactive and modal navigation sticks to the modal edge', () => {
  const chart = source('components/markets/InteractivePriceChart.tsx')
  const styles = source('app/globals.css')
  assert.match(chart, /onPointerMove=\{selectFromPointer\}/)
  assert.match(chart, /event\.key !== 'ArrowLeft'/)
  assert.match(chart, /formatPrice\(active\.close\)/)
  assert.match(styles, /\.stock-viewer-modal \.stock-viewer-outline \{\s*top: 0;/)
  assert.match(styles, /\.stock-viewer-chart polyline[\s\S]*stroke-width: 1\.75;/)
})

test('group rows expose full-row selection and a balanced constituent grid', () => {
  const explore = source('components/markets/MarketsExplore.tsx')
  const styles = source('app/globals.css')
  assert.match(explore, /role="button"[\s\S]*onClick=\{\(\) => setSelected\(item\.label\)\}/)
  assert.match(styles, /\.market-group-constituents \{[\s\S]*grid-template-columns: repeat\(2,/)
})
