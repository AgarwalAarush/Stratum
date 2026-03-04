// lib/scopes.ts
import type { ScopeDef } from './types'

export const SCOPES: ScopeDef[] = [
  {
    id: 'ai-research',
    label: 'AI Research',
    sections: [
      {
        id: 'papers',
        label: 'Research Papers',
        sources: ['arXiv', 'alphaXiv', 'Semantic Scholar'],
        itemType: 'paper',
        apiPath: '/api/ai-research/papers',
      },
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
    ],
  },
  {
    id: 'startups',
    label: 'Startups',
    sections: [
      {
        id: 'funding',
        label: 'Funding Rounds',
        sources: ['Crunchbase', 'Axios Pro Rata'],
        itemType: 'news',
        apiPath: '/api/startups/funding',
      },
      {
        id: 'news',
        label: 'Startup News',
        sources: ['TechCrunch', 'The Information'],
        itemType: 'news',
        apiPath: '/api/startups/news',
      },
    ],
  },
  {
    id: 'releases',
    label: 'Releases',
    sections: [
      {
        id: 'models',
        label: 'Model Releases',
        sources: ['Tracked Entities'],
        itemType: 'news',
        apiPath: '/api/releases/models',
      },
      {
        id: 'products',
        label: 'Product Launches',
        sources: ['Product Hunt'],
        itemType: 'news',
        apiPath: '/api/releases/products',
      },
      {
        id: 'repos',
        label: 'GitHub Trending',
        sources: ['GitHub'],
        itemType: 'repo',
        apiPath: '/api/releases/repos',
      },
    ],
  },
  {
    id: 'markets',
    label: 'Markets',
    sections: [
      {
        id: 'earnings-calendar',
        label: 'Earnings Calendar',
        sources: ['SEC EDGAR', 'Earnings Whispers'],
        itemType: 'earnings',
        apiPath: '/api/markets/earnings-calendar',
      },
      {
        id: 'macro',
        label: 'Macro Signals',
        sources: ['FRED', 'Fed Calendar'],
        itemType: 'news',
        apiPath: '/api/markets/macro',
      },
    ],
  },
  {
    id: 'macro',
    label: 'Macro',
    sections: [
      {
        id: 'indicators',
        label: 'Key Indicators',
        sources: ['FRED'],
        itemType: 'news',
        apiPath: '/api/macro/indicators',
      },
      {
        id: 'events',
        label: 'Fed & Policy Events',
        sources: ['FOMC', 'Fed Calendar'],
        itemType: 'news',
        apiPath: '/api/macro/events',
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
