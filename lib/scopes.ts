// lib/scopes.ts
import type { ScopeDef } from './types'

export const SCOPES: ScopeDef[] = [
  {
    id: 'ai-research',
    label: 'AI Research',
    featuredSectionId: 'papers',
    sections: [
      {
        id: 'discussions',
        label: 'Trending Discussions',
        sources: ['Hacker News', 'Lobste.rs'],
        itemType: 'discussion',
        apiPath: '/api/ai-research/discussions',
      },
      {
        id: 'repos',
        label: 'GitHub Trending',
        sources: ['GitHub'],
        itemType: 'repo',
        apiPath: '/api/ai-research/repos',
      },
      {
        id: 'ai-news',
        label: 'AI News',
        sources: ['Tracked Entities', 'TechCrunch', 'The Information', 'Product Hunt'],
        itemType: 'news',
        apiPath: '/api/ai-research/ai-news',
      },
      {
        id: 'papers',
        label: 'Research Papers',
        sources: ['arXiv', 'alphaXiv', 'Semantic Scholar'],
        itemType: 'paper',
        apiPath: '/api/ai-research/papers',
      },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    sections: [
      {
        id: 'earnings',
        label: 'Earnings',
        sources: ['SEC EDGAR', 'Earnings Whispers'],
        itemType: 'earnings',
        apiPath: '/api/finance/earnings',
      },
      {
        id: 'deals',
        label: 'Deals & M&A',
        sources: ['Crunchbase', 'Bloomberg'],
        itemType: 'news',
        apiPath: '/api/finance/deals',
      },
      {
        id: 'research-reports',
        label: 'Research Reports',
        sources: ['Citrini', 'ARK', 'a16z', 'Delphi'],
        itemType: 'news',
        apiPath: '/api/finance/reports',
      },
      {
        id: 'markets',
        label: 'Markets',
        sources: ['SEC EDGAR', 'Earnings Whispers'],
        itemType: 'earnings',
        apiPath: '/api/markets/earnings-calendar',
      },
      {
        id: 'macro',
        label: 'Macro',
        sources: ['FRED', 'FOMC', 'Fed Calendar'],
        itemType: 'news',
        apiPath: '/api/macro/indicators',
      },
    ],
  },
]

export const SCOPE_IDS = SCOPES.map((s) => s.id)

export const DEFAULT_SCOPE_ID = 'ai-research'

export function getScopeById(id: string): ScopeDef | undefined {
  return SCOPES.find((s) => s.id === id)
}

export function isValidScopeId(id: string): boolean {
  return SCOPE_IDS.includes(id)
}
