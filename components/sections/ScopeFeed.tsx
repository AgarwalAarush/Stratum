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
    <div className="w-full flex flex-col pt-10 px-12 pb-24 gap-12">

      {/* Top Row: etc, etc */}
      {gridSections.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {gridSections.map((section: ScopeDef['sections'][0]) => {
            const items = getMockSection(section.apiPath).items
            return (
              <SectionContainer
                key={section.id}
                label={section.label}
                sources={section.sources}
                itemCount={items.length}
                className="h-[420px]"
              >
                {items.slice(0, 6).map(renderItem)}
              </SectionContainer>
            )
          })}
        </div>
      )}

      {/* Bottom Row: Research Papers */}
      {featured && (
        <div className="flex-1 flex flex-col">
          <SectionContainer
            label={featured.label}
            sources={featured.sources}
            itemCount={featuredItems.length}
            featured
            className="flex-1 min-h-[600px]"
          >
            {featuredItems.length === 0
              ? <p className="px-8 py-10 text-[13px] text-[var(--text-muted)] text-center">No data available</p>
              : featuredItems.slice(0, 15).map(renderItem)
            }
          </SectionContainer>
        </div>
      )}

    </div>
  )
}
