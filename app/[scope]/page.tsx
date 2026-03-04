// app/[scope]/page.tsx
import { notFound } from 'next/navigation'
import { getScopeById, isValidScopeId } from '@/lib/scopes'
import { ScopeHeader } from '@/components/layout/ScopeHeader'
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
    <div>
      <ScopeHeader
        label={scope.label}
        lastUpdated="just now"
      />
      <ScopeFeed scope={scope} />
    </div>
  )
}

export function generateStaticParams() {
  return [
    { scope: 'ai-research' },
    { scope: 'finance' },
    { scope: 'startups' },
    { scope: 'releases' },
    { scope: 'markets' },
    { scope: 'macro' },
  ]
}
