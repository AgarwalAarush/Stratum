import { Suspense } from 'react'
import { MarketsExplore } from '@/components/markets/MarketsExplore'
import { ExploreShell, ExploreLoading } from '@/components/markets/ExploreShell'
import { requireAllowedMarketUser } from '@/lib/auth/markets-session'
import { exploreStockQuery, exploreView, type ExploreView } from '@/lib/markets/explore'
import type { ScreenerQuery } from '@/lib/markets/types'
import { fetchExploreData } from '@/lib/server/explore'

export default async function MarketsExplorePage({ searchParams }: {
  searchParams: Promise<{ view?: string; group?: string; groupType?: string }>
}) {
  const [params, user] = await Promise.all([searchParams, requireAllowedMarketUser()])
  const view = exploreView(params.view)
  const query = exploreStockQuery(params.group, params.groupType)
  return <ExploreShell view={view}>
    <Suspense key={`${view}:${JSON.stringify(query)}`} fallback={<ExploreLoading />}>
      <ExploreContent view={view} ownerId={user.id} query={query} />
    </Suspense>
  </ExploreShell>
}

async function ExploreContent({ view, ownerId, query }: { view: ExploreView; ownerId: string; query: ScreenerQuery }) {
  const data = await fetchExploreData(view, ownerId, query).catch(() => null)
  if (!data) return <p role="alert" className="py-8 text-sm text-[var(--text-muted)]">This view could not be loaded. Your saved data has not changed. Use Refresh to try again.</p>
  return <MarketsExplore data={data} />
}
