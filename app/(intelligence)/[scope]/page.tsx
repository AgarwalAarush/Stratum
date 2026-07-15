import { notFound, redirect } from 'next/navigation'
import { getScopeById, isValidScopeId, SCOPE_IDS } from '@/lib/scopes'
import { ScopeFeed } from '@/components/sections/ScopeFeed'

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

  return <ScopeFeed scope={scope} />
}

export function generateStaticParams() {
  return SCOPE_IDS.map((scope) => ({ scope }))
}
