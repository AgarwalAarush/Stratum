import { MarketEventsFeed } from '@/components/markets/MarketEventsFeed'

export default async function MarketsEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string }>
}) {
  const { symbol: requestedSymbol = '' } = await searchParams
  const focusedSymbol = /^[A-Z][A-Z0-9.-]{0,11}$/.test(requestedSymbol.toUpperCase())
    ? requestedSymbol.toUpperCase()
    : ''
  return <MarketEventsFeed focusedSymbol={focusedSymbol} />
}
