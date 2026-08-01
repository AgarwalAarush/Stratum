import { notFound, redirect } from 'next/navigation'
import { getScopeById, isValidScopeId, SCOPE_IDS } from '@/lib/scopes'
import { ScopeFeed } from '@/components/sections/ScopeFeed'
import { fetchScopeFeedPayload } from '@/lib/server/scope-feed'

// Feed items are server-seeded from the existing cached source layer. This is
// intentionally dynamic: statically exporting the page would freeze its data
// at build time when a source uses a no-store fetch.
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ scope: string }>
}

export default async function ScopePage({ params }: PageProps) {
  const { scope: scopeId } = await params

  if (scopeId === 'finance') {
    redirect('/markets')
  }

  if (!isValidScopeId(scopeId)) {
    notFound()
  }

  const scope = getScopeById(scopeId)!

  // Cached source sections are composed on the server and passed to SWR as
  // fallback data. The initial paint therefore contains real feed content
  // rather than waiting for a browser-side fan-out of section requests.
  const initialData = await fetchScopeFeedPayload(scope.id)
  return <ScopeFeed scope={scope} initialData={initialData ?? undefined} />
}

export function generateStaticParams() {
  return SCOPE_IDS.map((scope) => ({ scope }))
}
