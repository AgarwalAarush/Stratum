import { notFound } from 'next/navigation'
import { StockViewer } from '@/components/markets/StockViewer'
import { fetchStockViewerData } from '@/lib/server/markets-repository'
import { requireAllowedMarketUser } from '@/lib/auth/supabase-server'

export default async function StockViewerPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params
  const user = await requireAllowedMarketUser()
  const data = await fetchStockViewerData(symbol, user.id)
  if (!data) notFound()
  return <StockViewer data={data} />
}
