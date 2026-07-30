import { ThesisWorkspace } from '@/components/markets/ThesisWorkspace'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchThesisWorkspace } from '@/lib/server/theses'

export default async function MarketsThesesPage() {
  const user = await requireAllowedMarketUser()
  return <ThesisWorkspace initialData={await fetchThesisWorkspace(user.id)} />
}
