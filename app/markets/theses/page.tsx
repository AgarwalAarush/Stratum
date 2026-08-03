import { ThesisWorkspace } from '@/components/markets/ThesisWorkspace'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchThesisWorkspace } from '@/lib/server/theses'
import { fetchMarketThesisWorkspace } from '@/lib/server/world-memory'

export default async function MarketsThesesPage() {
  const user = await requireAllowedMarketUser()
  const [companyData, marketData] = await Promise.all([
    fetchThesisWorkspace(user.id),
    fetchMarketThesisWorkspace(user.id),
  ])
  return <ThesisWorkspace initialData={companyData} initialMarketData={marketData} />
}
