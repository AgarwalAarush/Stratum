// components/sections/ScopeFeed.tsx
import { RefreshCw } from 'lucide-react'
import type { ScopeDef, FeedItem } from '@/lib/types'
import { getMockSection } from '@/lib/mock-data'
import { fetchArxivPapers } from '@/lib/data/arxiv'
import { ScopeSection } from './ScopeSection'

interface ScopeFeedProps {
  scope: ScopeDef
}

export async function ScopeFeed({ scope }: ScopeFeedProps) {
  const sections = await Promise.all(
    scope.sections.map(async (section) => {
      let items: FeedItem[]

      if (section.id === 'papers') {
        items = await fetchArxivPapers(12)
      } else {
        items = getMockSection(section.apiPath).items
      }

      return { section, items }
    }),
  )

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
            just now
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {sections.map(({ section, items }) => (
          <ScopeSection
            key={section.id}
            label={section.label}
            items={items}
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
