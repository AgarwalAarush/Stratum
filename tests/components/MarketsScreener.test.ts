import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const screenerSource = readFileSync(
  join(process.cwd(), 'components/markets/MarketsScreener.tsx'),
  'utf8',
)

const conditionBuilderSource = readFileSync(
  join(process.cwd(), 'components/markets/ScreenerConditionBuilder.tsx'),
  'utf8',
)

test('screener delegates filter editing to the condition builder', () => {
  assert.match(screenerSource, /<ScreenerConditionBuilder filters=\{filters\} onChange=\{changeFilters\}/)
  assert.match(screenerSource, /market-screen-table-wrap scrollbar-none/)
  assert.equal(screenerSource.includes('Run screen'), false)
  assert.match(screenerSource, /void execute\(\{ filters: nextFilters, page: 1 \}\)/)
  assert.match(screenerSource, /RESULTS_PAGE_SIZE = 50/)
  assert.equal(screenerSource.includes('new IntersectionObserver'), false)
  assert.match(screenerSource, /Page \{response\.page\} of/)
  assert.match(screenerSource, /Previous/)
  assert.match(screenerSource, /Next/)
  assert.equal(screenerSource.includes('Keep scrolling to load more'), false)
  assert.equal(screenerSource.includes('ADDITIONAL_FILTERS'), false)
})

test('screener bounds hover prefetches instead of fetching every row crossed', () => {
  assert.match(screenerSource, /MAX_PREFETCHED_STOCKS = 3/)
  assert.match(screenerSource, /STOCK_PREFETCH_DELAY_MS = 140/)
  assert.match(screenerSource, /prefetchedStocks\.current\.size >= MAX_PREFETCHED_STOCKS/)
  assert.match(screenerSource, /onMouseLeave=\{cancelPreload\}/)
})

test('condition builder exposes only API-supported v1 fields', () => {
  for (const field of [
    'price',
    'dailyChange',
    'gap',
    'volume',
    'relativeVolume',
    'above50DayAverage',
    'fiftyTwoWeekPosition',
    'exchange',
    'tradable',
  ]) {
    assert.match(conditionBuilderSource, new RegExp(`field: '${field}'`))
  }
  assert.match(conditionBuilderSource, /SCREENER_RETURN_PERIODS/)
  assert.equal(conditionBuilderSource.includes("field: 'marketCap'"), false)
})

test('condition chips and add-condition flow are accessible dialogs', () => {
  assert.match(conditionBuilderSource, /aria-haspopup="dialog"/)
  assert.match(conditionBuilderSource, /role="dialog" aria-modal="true"/)
  assert.match(conditionBuilderSource, /aria-label="Search screener conditions"/)
  assert.match(conditionBuilderSource, /if \(event\.key === 'Escape'\)/)
  assert.match(conditionBuilderSource, /setAddOpen\(false\)/)
  assert.match(conditionBuilderSource, /if \(event\.key !== 'Tab'\) return/)
  assert.match(conditionBuilderSource, /document\.body\.style\.overflow = 'hidden'/)
})

test('existing conditions update in place and new fields append', () => {
  assert.match(conditionBuilderSource, /filters\.map\(\(filter\) => filter\.id === editingId/)
  assert.match(conditionBuilderSource, /onChange\(\[\.\.\.filters, withLabel/)
  assert.match(conditionBuilderSource, /This will update the existing condition/)
  assert.match(conditionBuilderSource, /market-condition-popover-scrim[\s\S]*onClick=\{applyEdit\}/)
})
