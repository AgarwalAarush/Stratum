import { notFound } from 'next/navigation'
import { StockViewer } from '@/components/markets/StockViewer'
import { StockViewerModal } from '@/components/markets/StockViewerModal'
import { fetchStockViewerData } from '@/lib/server/markets-repository'

export default async function InterceptedStockViewerPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params
  const data = await fetchStockViewerData(symbol)
  if (!data) notFound()
  return <StockViewerModal symbol={data.symbol}><StockViewer data={data} /></StockViewerModal>
}
