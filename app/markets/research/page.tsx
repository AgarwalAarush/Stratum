import { MarketsFeedPage } from '@/components/markets/MarketsFeedPage'
import { fetchFinanceReports } from '@/lib/data/finance-reports'
import { fetchPersistedFmpMarketItems } from '@/lib/data/fmp-intelligence'
import { mergeMarketNews } from '@/lib/markets/news'

function normalizeSymbol(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null
  const symbol = value.trim().toUpperCase()
  return /^[A-Z][A-Z0-9.-]{0,5}$/.test(symbol) ? symbol : null
}

export default async function MarketsResearchPage({ searchParams }: { searchParams: Promise<{ symbol?: string | string[] }> }) {
  const symbol = normalizeSymbol((await searchParams).symbol)
  const [reports, filings] = await Promise.all([
    fetchFinanceReports(30).catch(() => []),
    fetchPersistedFmpMarketItems(['fmp-sec-filings'], 30).catch(() => []),
  ])
  const items = mergeMarketNews([filings, reports], 40)

  return (
    <MarketsFeedPage
      eyebrow={symbol ? `${symbol} research context` : 'Research library'}
      title={symbol ? `Research around ${symbol}` : 'Institutional ideas and theses'}
      description={symbol
        ? `Current market and thematic research opened from the ${symbol} screener row. Company-specific authored notes will join this evidence feed when a durable research artifact exists.`
        : 'Current SEC filings from FMP plus institutional reports and thematic work, normalized with source and publication timestamps.'}
      items={items}
      emptyMessage="No current research report is inside the verified lookback window."
    />
  )
}
