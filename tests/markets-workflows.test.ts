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

test('Markets prefetches expensive destinations on intent instead of at first paint', () => {
  const shell = source('components/markets/MarketsShell.tsx')
  const intentLink = source('components/markets/MarketsIntentLink.tsx')
  const screener = source('components/markets/MarketsScreener.tsx')
  assert.match(shell, /prefetch=\{false\}/)
  assert.match(shell, /onMouseEnter=\{\(\) => prefetchRoute\(item\.href\)\}/)
  assert.match(intentLink, /prefetch=\{false\}/)
  assert.match(intentLink, /onMouseEnter=\{\(event\) =>/)
  assert.match(screener, /onMouseEnter=\{\(\) => preloadStock\(row\.symbol\)\}/)
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
  assert.equal(decisionRail.includes('Trading and order placement are intentionally out of scope.'), false)
  assert.equal(source('components/markets/ResearchActionButton.tsx').includes('macserver worker'), false)
  assert.match(viewer, /Full equity research/)
  assert.match(viewer, /<a[\s\S]*href=\{`\/markets\/stocks\/\$\{data\.symbol\}\/research`\}/)
  assert.doesNotMatch(viewer, /<MarketsIntentLink[\s\S]*Full equity research/)
  assert.match(viewer, /Why \{data\.symbol\} was surfaced/)
  assert.match(viewer, /Next FY P\/E/)
  assert.equal(viewer.includes('stock-viewer-research-summary'), false)
})

test('Stock Viewer supports intercepted desktop routing and a canonical deep link', () => {
  assert.match(source('app/markets/stocks/[symbol]/page.tsx'), /<StockViewer data=\{data\}/)
  assert.match(source('app/markets/@modal/(.)stocks/[symbol]/page.tsx'), /<StockViewerModal/)
  assert.match(source('components/markets/StockViewerModal.tsx'), /router\.back\(\)/)
  assert.match(source('components/markets/StockViewerModal.tsx'), /event\.key === 'Escape'/)
  assert.match(source('components/markets/ResearchActionButton.tsx'), /href=\{`\/markets\/stocks\/\$\{symbol\}\/research`\}/)
})

test('Stock Viewer chart is interactive and modal navigation sticks to the modal edge', () => {
  const chart = source('components/markets/InteractivePriceChart.tsx')
  const styles = source('app/globals.css')
  assert.match(chart, /onPointerMove=\{selectFromPointer\}/)
  assert.match(chart, /event\.key !== 'ArrowLeft'/)
  assert.match(chart, /formatPrice\(active\.close\)/)
  assert.match(chart, /stock-price-chart-period-picker/)
  assert.match(chart, /aria-label="Price history period"/)
  assert.match(chart, /historyForPeriod\(history, period\)/)
  assert.match(styles, /\.stock-viewer-modal \.stock-viewer-outline \{\s*top: 0;/)
  assert.match(styles, /\.stock-viewer-chart polyline[\s\S]*stroke-width: 1\.75;/)
})

test('group rows expose full-row selection and a balanced constituent grid', () => {
  const explore = source('components/markets/MarketsExplore.tsx')
  const styles = source('app/globals.css')
  assert.match(explore, /role="button"[\s\S]*onClick=\{\(\) => setSelected\(item\.label\)\}/)
  assert.match(explore, /<th>1d<\/th>/)
  assert.match(explore, /percent\(item\.dayReturn\)/)
  assert.match(explore, /percent\(group\.dayReturn\)/)
  assert.match(styles, /\.market-group-constituents \{[\s\S]*grid-template-columns: repeat\(2,/)
})

test('return filters use a custom period picker instead of the browser select menu', () => {
  const builder = source('components/markets/ScreenerConditionBuilder.tsx')
  assert.match(builder, /className="market-return-period-picker"/)
  assert.match(builder, /role="menu" aria-label="Price change period"/)
  assert.match(builder, /className="market-return-period-menu"/)
})
