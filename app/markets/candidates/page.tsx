import { CandidateScout } from '@/components/markets/CandidateScout'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchLatestCandidates } from '@/lib/server/markets-repository'

export default async function MarketsCandidatesPage() {
  await requireAllowedMarketUser()
  const candidates = await fetchLatestCandidates(24)
  return <CandidateScout candidates={candidates} />
}
