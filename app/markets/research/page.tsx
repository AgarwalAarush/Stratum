import { MarketsFeedPage } from '@/components/markets/MarketsFeedPage'
import { fetchFinanceReports } from '@/lib/data/finance-reports'

function normalizeSymbol(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null
  const symbol = value.trim().toUpperCase()
  return /^[A-Z][A-Z0-9.-]{0,5}$/.test(symbol) ? symbol : null
}

export default async function MarketsResearchPage({ searchParams }: { searchParams: Promise<{ symbol?: string | string[] }> }) {
  const symbol = normalizeSymbol((await searchParams).symbol)
  const items = await fetchFinanceReports(30).catch(() => [])

  return (
    <MarketsFeedPage
      eyebrow={symbol ? `${symbol} research context` : 'Research library'}
      title={symbol ? `Research around ${symbol}` : 'Institutional ideas and theses'}
      description={symbol
        ? `Current market and thematic research opened from the ${symbol} screener row. Company-specific authored notes will join this evidence feed when a durable research artifact exists.`
        : 'Current institutional reports and thematic work, normalized from Stratum’s research ingestion with source and publication timestamps.'}
      items={items}
      emptyMessage="No current research report is inside the verified lookback window."
    />
  )
}
