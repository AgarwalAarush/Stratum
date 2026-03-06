'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { RefreshCw } from 'lucide-react'
import type { ScopeDef, SectionData } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'
import { ScopeSection } from './ScopeSection'

interface ScopeFeedProps {
  scope: ScopeDef
}

type ScopeSectionsMap = Record<string, SectionData>

async function fetchSection(apiPath: string): Promise<SectionData> {
  try {
    const response = await fetch(apiPath, {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch ${apiPath} (${response.status})`)
    }

    const data = (await response.json()) as SectionData
    if (!data || !Array.isArray(data.items) || typeof data.fetchedAt !== 'string') {
      throw new Error(`Invalid section payload for ${apiPath}`)
    }

    return data
  } catch {
    return {
      items: [],
      fetchedAt: new Date().toISOString(),
    }
  }
}

export function ScopeFeed({ scope }: ScopeFeedProps) {
  const swrKey = useMemo(
    () => `scope:${scope.id}:${scope.sections.map((section) => section.apiPath).join('|')}`,
    [scope.id, scope.sections],
  )

  const { data, isLoading } = useSWR<ScopeSectionsMap>(
    swrKey,
    async () => {
      const sections = await Promise.all(
        scope.sections.map(async (section) => {
          const payload = await fetchSection(section.apiPath)
          return [section.id, payload] as const
        }),
      )
      return Object.fromEntries(sections)
    },
    {
      refreshInterval: 180_000,
      revalidateOnFocus: true,
      dedupingInterval: 30_000,
    },
  )

  const lastUpdatedLabel = useMemo(() => {
    const fetchedAt = scope.sections
      .map((section) => data?.[section.id]?.fetchedAt)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]

    if (fetchedAt) return formatRelativeTime(fetchedAt)
    return isLoading ? 'loading...' : 'just now'
  }, [data, isLoading, scope.sections])

  return (
    <div className="w-full h-full min-h-0 flex flex-col bg-[var(--bg)]">
      <header className="h-[var(--top-header-height)] flex items-center justify-between px-6 border-b border-black/10 shrink-0 gap-4">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold text-[var(--text)] leading-[1.3]">
            {scope.label}
          </h1>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 border-l border-black/10 pl-3">
          <RefreshCw size={11} className="text-black/35" />
          <span className="font-mono text-[11px] text-black/35 whitespace-nowrap">
            {lastUpdatedLabel}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {scope.sections.map((section) => (
          <ScopeSection
            key={section.id}
            label={section.label}
            items={data?.[section.id]?.items ?? []}
            defaultExpanded
            collapseAfter={5}
          />
        ))}
        <div className="px-6 py-8">
          <p className="font-mono text-[11px] text-black/20 text-center">
            — END OF FEED —
          </p>
        </div>
      </div>
    </div>
  )
}
