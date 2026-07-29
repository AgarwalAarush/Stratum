import { notFound } from 'next/navigation'
import { StockViewer } from '@/components/markets/StockViewer'
import { fetchStockViewerData } from '@/lib/server/markets-repository'

export default async function StockViewerPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params
  const data = await fetchStockViewerData(symbol)
  if (!data) notFound()
  return <StockViewer data={data} />
}
