// app/[scope]/page.tsx
import { notFound } from 'next/navigation'
import { getScopeById, isValidScopeId, SCOPE_IDS } from '@/lib/scopes'
import { ScopeFeed } from '@/components/sections/ScopeFeed'

interface PageProps {
  params: Promise<{ scope: string }>
}

export default async function ScopePage({ params }: PageProps) {
  const { scope: scopeId } = await params

  if (!isValidScopeId(scopeId)) {
    notFound()
  }

  const scope = getScopeById(scopeId)!

  return (
    <div className="flex-1 overflow-hidden min-h-0">
      <ScopeFeed scope={scope} />
    </div>
  )
}

export function generateStaticParams() {
  return SCOPE_IDS.map((scope) => ({ scope }))
}
