import { MarketsFeedPage } from '@/components/markets/MarketsFeedPage'
import { fetchMacroIndicators } from '@/lib/data/finance-macro'

export default async function MarketsMacroPage() {
  const items = await fetchMacroIndicators(24).catch(() => [])
  return (
    <MarketsFeedPage
      eyebrow="Macro evidence"
      title="Rates, inflation, and growth"
      description="Current releases and central-bank signals from FRED, official feeds, and normalized macro coverage. Every item links to its source."
      items={items}
      emptyMessage="No macro release is inside the current lookback window."
    />
  )
}
