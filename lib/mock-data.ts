// lib/mock-data.ts
import type { FeedItem, SectionData } from './types'

// ─── AI Research: Papers ───
const PAPERS: FeedItem[] = [
  {
    type: 'paper',
    id: 'arxiv-2401-1',
    title: 'Scaling Laws for Reward Model Overoptimization in RLHF',
    authors: ['Gao', 'et al.'],
    categories: ['cs.LG', 'cs.AI'],
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    url: 'https://arxiv.org/abs/2210.10760',
  },
  {
    type: 'paper',
    id: 'arxiv-2401-2',
    title: 'Phi-4 Technical Report',
    authors: ['Abdin', 'et al.'],
    categories: ['cs.CL', 'cs.AI'],
    publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    url: 'https://arxiv.org/abs/2412.08905',
  },
  {
    type: 'paper',
    id: 'arxiv-2401-3',
    title: 'DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning',
    authors: ['DeepSeek-AI'],
    categories: ['cs.CL', 'cs.AI'],
    publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    url: 'https://arxiv.org/abs/2501.12948',
  },
  {
    type: 'paper',
    id: 'arxiv-2401-4',
    title: 'Constitutional AI: Harmlessness from AI Feedback',
    authors: ['Bai', 'et al.'],
    categories: ['cs.AI', 'cs.LG'],
    publishedAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
    url: 'https://arxiv.org/abs/2212.08073',
  },
  {
    type: 'paper',
    id: 'arxiv-2401-5',
    title: 'Mixture of Experts Meets Instruction Tuning: A Winning Combination for Large Language Models',
    authors: ['Shen', 'et al.'],
    categories: ['cs.CL'],
    publishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    url: 'https://arxiv.org/abs/2305.14705',
  },
]

// ─── AI Research: Discussions ───
const AI_DISCUSSIONS: FeedItem[] = [
  {
    type: 'discussion',
    id: 'hn-1',
    title: 'Ask HN: What are you building with local LLMs in 2025?',
    points: 847,
    commentCount: 312,
    source: 'HN',
    publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    url: 'https://news.ycombinator.com/item?id=39000000',
  },
  {
    type: 'discussion',
    id: 'hn-2',
    title: 'Show HN: I built a Perplexity clone that runs entirely on-device',
    points: 412,
    commentCount: 89,
    source: 'HN',
    publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    url: 'https://news.ycombinator.com/item?id=39000001',
  },
  {
    type: 'discussion',
    id: 'hn-3',
    title: 'The Bitter Lesson (2019) — still the most important essay in ML',
    points: 318,
    commentCount: 142,
    source: 'HN',
    publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    url: 'https://news.ycombinator.com/item?id=39000002',
  },
  {
    type: 'discussion',
    id: 'lobsters-1',
    title: 'Writing a language model from scratch in Rust',
    points: 92,
    commentCount: 24,
    source: 'Lobste.rs',
    publishedAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
    url: 'https://lobste.rs/s/example',
  },
]

// ─── AI Research: Repos ───
const AI_REPOS: FeedItem[] = [
  {
    type: 'repo',
    id: 'repo-1',
    owner: 'ggerganov',
    name: 'llama.cpp',
    description: 'LLM inference in C/C++ with CPU support',
    language: 'C++',
    starsToday: 1240,
    totalStars: 68400,
    url: 'https://github.com/ggerganov/llama.cpp',
  },
  {
    type: 'repo',
    id: 'repo-2',
    owner: 'microsoft',
    name: 'TaskWeaver',
    description: 'A code-first agent framework for data analytics tasks',
    language: 'Python',
    starsToday: 892,
    totalStars: 5200,
    url: 'https://github.com/microsoft/TaskWeaver',
  },
  {
    type: 'repo',
    id: 'repo-3',
    owner: 'huggingface',
    name: 'smolagents',
    description: 'Minimal agentic AI library from Hugging Face',
    language: 'Python',
    starsToday: 634,
    totalStars: 8900,
    url: 'https://github.com/huggingface/smolagents',
  },
  {
    type: 'repo',
    id: 'repo-4',
    owner: 'vercel',
    name: 'ai',
    description: 'Build AI-powered applications with React, Svelte, Vue, and Solid',
    language: 'TypeScript',
    starsToday: 421,
    totalStars: 14200,
    url: 'https://github.com/vercel/ai',
  },
]

// ─── Finance: Earnings ───
const EARNINGS: FeedItem[] = [
  {
    type: 'earnings',
    id: 'earn-1',
    ticker: 'NVDA',
    companyName: 'Nvidia Corp',
    quarter: 'Q4 2025',
    reportDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    epsActual: 0.89,
    epsEstimate: 0.85,
    revenueActual: 22100,
    revenueEstimate: 20400,
    beat: true,
    url: 'https://www.sec.gov/cgi-bin/browse-edgar',
  },
  {
    type: 'earnings',
    id: 'earn-2',
    ticker: 'MSFT',
    companyName: 'Microsoft Corp',
    quarter: 'Q2 FY2026',
    reportDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    epsEstimate: 3.20,
    revenueEstimate: 69500,
    url: 'https://www.sec.gov/cgi-bin/browse-edgar',
  },
  {
    type: 'earnings',
    id: 'earn-3',
    ticker: 'GOOGL',
    companyName: 'Alphabet Inc',
    quarter: 'Q4 2025',
    reportDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    epsActual: 2.15,
    epsEstimate: 2.22,
    revenueActual: 96400,
    revenueEstimate: 95800,
    beat: false,
    url: 'https://www.sec.gov/cgi-bin/browse-edgar',
  },
]

// ─── Startups: Funding ───
const FUNDING: FeedItem[] = [
  {
    type: 'news',
    id: 'fund-1',
    title: 'Anduril raises $1.5B Series F at $28B valuation to accelerate defense AI',
    source: 'Axios Pro Rata',
    category: 'Series F',
    publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    url: 'https://www.axios.com',
  },
  {
    type: 'news',
    id: 'fund-2',
    title: 'Perplexity closes $500M Series C led by SoftBank Vision Fund',
    source: 'TechCrunch',
    category: 'Series C',
    publishedAt: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
    url: 'https://techcrunch.com',
  },
  {
    type: 'news',
    id: 'fund-3',
    title: 'xAI raises $6B in new funding round as Grok 3 gains traction',
    source: 'The Information',
    category: 'Strategic',
    publishedAt: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
    url: 'https://www.theinformation.com',
  },
  {
    type: 'news',
    id: 'fund-4',
    title: 'TerraPower breaks ground on Natrium reactor in Wyoming',
    source: 'Axios',
    category: 'Energy',
    publishedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    url: 'https://www.axios.com',
  },
]

// ─── Releases: Model releases ───
const MODEL_RELEASES: FeedItem[] = [
  {
    type: 'news',
    id: 'rel-1',
    title: 'Anthropic releases Claude 3.7 Sonnet with extended thinking',
    source: 'Anthropic',
    category: 'Model Release',
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    url: 'https://www.anthropic.com',
  },
  {
    type: 'news',
    id: 'rel-2',
    title: 'Google DeepMind releases Gemini 2.0 Flash with real-time audio',
    source: 'Google DeepMind',
    category: 'Model Release',
    publishedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
    url: 'https://deepmind.google',
  },
  {
    type: 'news',
    id: 'rel-3',
    title: 'Meta releases Llama 4 Scout with 10M context window',
    source: 'Meta AI',
    category: 'Model Release',
    publishedAt: new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString(),
    url: 'https://ai.meta.com',
  },
]

// ─── Macro: Indicators ───
const MACRO_INDICATORS: FeedItem[] = [
  {
    type: 'news',
    id: 'macro-1',
    title: 'CPI (Jan 2026): +0.3% MoM, +3.1% YoY — above expectations of +2.9%',
    source: 'FRED / BLS',
    category: 'CPI',
    publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    url: 'https://fred.stlouisfed.org',
  },
  {
    type: 'news',
    id: 'macro-2',
    title: 'Unemployment Rate (Jan 2026): 4.1% — unchanged from prior month',
    source: 'FRED / BLS',
    category: 'Employment',
    publishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    url: 'https://fred.stlouisfed.org',
  },
  {
    type: 'news',
    id: 'macro-3',
    title: 'PCE Deflator (Dec 2025): +2.6% YoY — Fed target remains 2%',
    source: 'FRED / BEA',
    category: 'PCE',
    publishedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    url: 'https://fred.stlouisfed.org',
  },
]

// ─── Registry: maps apiPath → items ───
export const MOCK_DATA: Record<string, FeedItem[]> = {
  '/api/ai-research/papers': PAPERS,
  '/api/ai-research/discussions': AI_DISCUSSIONS,
  '/api/ai-research/repos': AI_REPOS,
  '/api/finance/earnings': EARNINGS,
  '/api/finance/deals': FUNDING,
  '/api/finance/reports': [],
  '/api/startups/funding': FUNDING,
  '/api/startups/news': FUNDING,
  '/api/releases/models': MODEL_RELEASES,
  '/api/releases/products': [],
  '/api/releases/repos': AI_REPOS,
  '/api/markets/earnings-calendar': EARNINGS,
  '/api/markets/macro': MACRO_INDICATORS,
  '/api/macro/indicators': MACRO_INDICATORS,
  '/api/macro/events': [],
}

export function getMockSection(apiPath: string): SectionData {
  return {
    items: MOCK_DATA[apiPath] ?? [],
    fetchedAt: new Date().toISOString(),
  }
}
