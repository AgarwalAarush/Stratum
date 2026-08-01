'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import dynamic from 'next/dynamic'
import type { OverviewData, ScopeDef, SectionData } from '@/lib/types'
import type { ScopeFeedPayload } from '@/lib/server/scope-feed'
import { formatRelativeTime } from '@/lib/utils'
import { ScopeSection } from './ScopeSection'
import { AIOverview } from './AIOverview'
import { IntelligenceResearchDashboard } from '@/components/intelligence/IntelligenceResearchDashboard'

const GlobalNewsMap = dynamic(
  () => import('./GlobalNewsMap').then((m) => ({ default: m.GlobalNewsMap })),
  {
    loading: () => <div className="h-[260px] border-b border-border" />,
    ssr: false,
  },
)

interface ScopeFeedProps {
  scope: ScopeDef
  initialData?: ScopeFeedPayload
}

export const SCOPE_REFRESH_INTERVAL_MS = 3_600_000

type ScopeSectionsMap = Record<string, SectionData>
type ScopeSectionDef = ScopeDef['sections'][number]

interface SectionRenderOptions {
  columns?: number
  fillByColumn?: boolean
  viewportMode?: 'fixed' | 'fill' | 'natural'
}

async function fetchScope(scopeId: string): Promise<ScopeFeedPayload> {
  try {
    const response = await fetch(`/api/scopes/${scopeId}`, {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch scope ${scopeId} (${response.status})`)
    }

    const data = (await response.json()) as ScopeFeedPayload
    if (!data || typeof data !== 'object' || !data.sections || typeof data.sections !== 'object') {
      throw new Error(`Invalid scope payload for ${scopeId}`)
    }

    return data
  } catch {
    return {
      sections: {},
      overview: null,
    }
  }
}

export function ScopeFeed({ scope, initialData }: ScopeFeedProps) {
  const swrKey = useMemo(
    () => `scope:${scope.id}`,
    [scope.id],
  )

  const { data: scopeData, isLoading } = useSWR<ScopeFeedPayload>(
    swrKey,
    () => fetchScope(scope.id),
    {
      fallbackData: initialData,
      refreshInterval: SCOPE_REFRESH_INTERVAL_MS,
      revalidateOnFocus: !initialData,
      revalidateOnMount: !initialData,
      dedupingInterval: 30_000,
    },
  )

  const data: ScopeSectionsMap | undefined = scopeData?.sections

  const lastUpdatedLabel = useMemo(() => {
    const fetchedAt = scope.sections
      .map((section) => data?.[section.id]?.fetchedAt)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]

    if (fetchedAt) return formatRelativeTime(fetchedAt)
    return isLoading ? 'loading...' : 'just now'
  }, [data, isLoading, scope.sections])

  const isAiResearchScope = scope.id === 'ai-research'
  const isGlobalNewsScope = scope.id === 'global-news'

  const overviewData: OverviewData | undefined = isAiResearchScope ? scopeData?.overview ?? undefined : undefined
  const globalNewsOverviewData: OverviewData | undefined = isGlobalNewsScope ? scopeData?.overview ?? undefined : undefined
  const overviewLoading = isAiResearchScope && isLoading
  const globalNewsOverviewLoading = isGlobalNewsScope && isLoading

  const sectionById = useMemo<Record<string, ScopeSectionDef>>(
    () =>
      Object.fromEntries(
        scope.sections.map((section) => [section.id, section] as const),
      ) as Record<string, ScopeSectionDef>,
    [scope.sections],
  )

  function renderSection(sectionId: string, options: SectionRenderOptions = {}) {
    const section = sectionById[sectionId]
    if (!section) return null

    return (
      <ScopeSection
        key={section.id}
        label={section.label}
        items={data?.[section.id]?.items ?? []}
        columns={options.columns ?? (section.id === 'earnings' ? 3 : 1)}
        fillByColumn={options.fillByColumn ?? (section.id === 'earnings')}
        itemsPerColumn={section.id === 'earnings' ? 4 : undefined}
        viewportMode={
          options.viewportMode
            ?? (section.id === 'tech-events'
              ? 'fill'
              : section.id === 'earnings'
                ? 'natural'
                : 'fixed')
        }
      />
    )
  }

  return (
    <div className="w-full min-w-0 bg-[var(--bg)]">
      {isAiResearchScope ? (
        <IntelligenceResearchDashboard
          sections={data ?? {}}
          overviewBullets={overviewData?.bullets ?? []}
          isLoading={isLoading}
          overviewLoading={overviewLoading}
          lastUpdatedLabel={lastUpdatedLabel}
          totalSectionCount={scope.sections.length}
        />
      ) : (
        <div className="intelligence-legacy-feed">
          <AIOverview
            title="Global News Overview"
            bullets={globalNewsOverviewData?.bullets ?? []}
            isLoading={globalNewsOverviewLoading}
          />
          <GlobalNewsMap />
          {scope.sections
            .filter((section) => section.id !== 'global-supply-chains' && section.id !== 'global-health')
            .map((section) => {
              if (section.id === 'european-union' && sectionById['global-supply-chains']) {
                return (
                  <div key="eu-supply-pair" className="grid grid-cols-1 xl:grid-cols-2 xl:divide-x xl:divide-border">
                    {renderSection('european-union')}
                    {renderSection('global-supply-chains')}
                  </div>
                )
              }
              if (section.id === 'global-summits' && sectionById['global-health']) {
                return (
                  <div key="summits-health-pair" className="grid grid-cols-1 xl:grid-cols-2 xl:divide-x xl:divide-border">
                    {renderSection('global-summits')}
                    {renderSection('global-health')}
                  </div>
                )
              }
              return renderSection(
                section.id,
                (section.id === 'geopolitics' || section.id === 'us-news') ? { columns: 2 } : {},
              )
            })}
          <div className="px-6 py-8">
            <p className="font-mono text-[11px] text-text-muted text-center">
              — END OF FEED —
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
