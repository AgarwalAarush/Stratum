// components/sections/ScopeFeed.tsx
import type { ScopeDef, FeedItem } from '@/lib/types'
import { getMockSection } from '@/lib/mock-data'
import { fetchArxivPapers } from '@/lib/data/arxiv'
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

export async function ScopeFeed({ scope }: ScopeFeedProps) {
  const featured = scope.featuredSectionId
    ? scope.sections.find(s => s.id === scope.featuredSectionId)
    : null
  const gridSections = scope.sections.filter(s => s.id !== scope.featuredSectionId)

  let featuredItems: FeedItem[] = []
  if (featured) {
    if (featured.id === 'papers') {
      featuredItems = await fetchArxivPapers(10)
    } else {
      featuredItems = getMockSection(featured.apiPath).items
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top grid (contiguous borders) */}
      <div className={`grid grid-cols-1 md:grid-cols-${Math.min(gridSections.length, 3)} border-b border-[var(--border)] min-h-[40%]`}>
        {gridSections.map((section, idx) => {
          const { items } = getMockSection(section.apiPath)
          const visibleItems = items.slice(0, 8)
          const isNotLast = idx !== Math.min(gridSections.length, 3) - 1

          return (
            <SectionContainer
              key={section.id}
              label={section.label}
              sources={section.sources}
              itemCount={items.length}
              className={isNotLast ? 'border-r border-[var(--border)]' : ''}
            >
              {visibleItems.length === 0
                ? <p className="px-5 py-8 text-[12px] text-[var(--text-muted)] text-center">No data available</p>
                : visibleItems.map(renderItem)
              }
            </SectionContainer>
          )
        })}
      </div>

      {/* Featured full-width section */}
      {featured && (
        <SectionContainer
          label={featured.label}
          sources={featured.sources}
          itemCount={featuredItems.length}
          featured
          className="flex-1 min-h-[40%]"
        >
          {featuredItems.length === 0
            ? <p className="px-5 py-8 text-[12px] text-[var(--text-muted)] text-center">No data available</p>
            : featuredItems.slice(0, 15).map(renderItem)
          }
        </SectionContainer>
      )}
    </div>
  )
}
