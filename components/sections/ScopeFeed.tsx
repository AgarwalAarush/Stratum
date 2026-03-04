// components/sections/ScopeFeed.tsx
import type { ScopeDef, FeedItem } from '@/lib/types'
import { getMockSection } from '@/lib/mock-data'
import { SectionContainer } from './SectionContainer'
import { PaperItem, DiscussionItem, RepoItem, EarningsItem, NewsItem } from '@/components/items'

function renderItem(item: FeedItem) {
  switch (item.type) {
    case 'paper':
      return <PaperItem key={item.id} item={item} />
    case 'discussion':
      return <DiscussionItem key={item.id} item={item} />
    case 'repo':
      return <RepoItem key={item.id} item={item} />
    case 'earnings':
      return <EarningsItem key={item.id} item={item} />
    case 'news':
      return <NewsItem key={item.id} item={item} />
  }
}

interface ScopeFeedProps {
  scope: ScopeDef
}

export function ScopeFeed({ scope }: ScopeFeedProps) {
  return (
    <div className="flex flex-col gap-4 p-6">
      {scope.sections.map((section) => {
        const { items } = getMockSection(section.apiPath)
        const visibleItems = items.slice(0, 5)

        return (
          <SectionContainer
            key={section.id}
            label={section.label}
            sources={section.sources}
            itemCount={items.length}
          >
            {visibleItems.length === 0 ? (
              <p className="px-4 py-8 text-[11px] text-[var(--text-muted)] text-center">
                No data available
              </p>
            ) : (
              visibleItems.map(renderItem)
            )}
          </SectionContainer>
        )
      })}
    </div>
  )
}
