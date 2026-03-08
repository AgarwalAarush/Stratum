// lib/scopes.ts
import type { ScopeDef } from './types.ts'

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
        sources: ['Hackathons', 'Devpost', 'MLH'],
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
        id: 'macro',
        label: 'Macro',
        sources: ['FRED', 'FOMC', 'Fed Calendar'],
        itemType: 'news',
        apiPath: '/api/macro/indicators',
      },
    ],
  },
  {
    id: 'global-news',
    label: 'Global News',
    sections: [
      {
        id: 'geopolitics',
        label: 'Geopolitics & Conflicts',
        sources: ['Reuters', 'AP News', 'Al Jazeera', 'Foreign Affairs', 'CSIS'],
        itemType: 'news',
        apiPath: '/api/global-news/news/geopolitics',
      },
      {
        id: 'european-union',
        label: 'European Union',
        sources: ['Euractiv', 'Politico EU', 'ECB'],
        itemType: 'news',
        apiPath: '/api/global-news/news/european-union',
      },
      {
        id: 'climate-environment',
        label: 'Climate & Environment',
        sources: ['Carbon Brief', 'The Guardian', 'Climate Policy'],
        itemType: 'news',
        apiPath: '/api/global-news/news/climate-environment',
      },
      {
        id: 'global-supply-chains',
        label: 'Global Supply Chains',
        sources: ['Trade News', 'Shipping & Logistics', 'Commodities'],
        itemType: 'news',
        apiPath: '/api/global-news/news/global-supply-chains',
      },
      {
        id: 'global-summits',
        label: 'Global Summits & Conferences',
        sources: ['G7/G20', 'United Nations', 'WEF', 'NATO'],
        itemType: 'news',
        apiPath: '/api/global-news/news/global-summits',
      },
      {
        id: 'global-health',
        label: 'Global Health',
        sources: ['WHO', 'Pandemic Watch', 'Health Policy'],
        itemType: 'news',
        apiPath: '/api/global-news/news/global-health',
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
