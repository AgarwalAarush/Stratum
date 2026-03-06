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
        label: 'Emerging GitHub Repos',
        sources: ['GitHub Search'],
        itemType: 'repo',
        apiPath: '/api/ai-research/repos',
      },
      {
        id: 'papers',
        label: 'Research Papers',
        sources: ['arXiv', 'alphaXiv', 'Semantic Scholar'],
        itemType: 'paper',
        apiPath: '/api/ai-research/papers',
      },
      {
        id: 'ai-news-general',
        label: 'General AI News',
        sources: ['AI News', 'VentureBeat AI', 'The Verge AI', 'MIT Tech Review AI'],
        itemType: 'news',
        apiPath: '/api/ai-research/news/general',
      },
      {
        id: 'cybersecurity',
        label: 'Cybersecurity',
        sources: ['Krebs Security', 'The Hacker News', 'Dark Reading'],
        itemType: 'news',
        apiPath: '/api/ai-research/news/cybersecurity',
      },
      {
        id: 'venture-capital',
        label: 'Venture Capital',
        sources: ['TechCrunch Venture', 'Crunchbase News', 'CB Insights', 'a16z Blog'],
        itemType: 'news',
        apiPath: '/api/ai-research/news/venture-capital',
      },
      {
        id: 'ai-policy-regulation',
        label: 'AI Policy & Regulation',
        sources: ['Politico Tech', 'EU Digital Policy', 'AI Regulation'],
        itemType: 'news',
        apiPath: '/api/ai-research/news/policy',
      },
      {
        id: 'new-technology',
        label: 'New Technology',
        sources: ['TechCrunch', 'Ars Technica', 'The Verge', 'TechMeme'],
        itemType: 'news',
        apiPath: '/api/ai-research/news/new-technology',
      },
      {
        id: 'startups',
        label: 'Startups',
        sources: ['TechCrunch Startups', 'Tech in Asia', 'Unicorn News', 'IPO News'],
        itemType: 'news',
        apiPath: '/api/ai-research/news/startups',
      },
      {
        id: 'infra-hardware',
        label: 'Infra & Hardware',
        sources: ["Tom's Hardware", 'SemiAnalysis', 'InfoQ', 'The New Stack'],
        itemType: 'news',
        apiPath: '/api/ai-research/news/infra-hardware',
      },
      {
        id: 'tech-events',
        label: 'Tech Events',
        sources: ['Dev Events', 'dev.events'],
        itemType: 'news',
        apiPath: '/api/ai-research/news/tech-events',
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
