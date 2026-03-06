// lib/mock-data.ts
import type { FeedItem, NewsItem, SectionData } from './types'

// ─── AI Research: Papers (accurate publication dates) ───
const PAPERS: FeedItem[] = [
  {
    type: 'paper',
    id: 'arxiv-2210-1',
    title: 'Scaling Laws for Reward Model Overoptimization in RLHF',
    authors: ['Gao', 'et al.'],
    categories: ['cs.LG', 'cs.AI'],
    publishedAt: '2022-10-19T00:00:00Z',
    url: 'https://arxiv.org/abs/2210.10760',
  },
  {
    type: 'paper',
    id: 'arxiv-2412-1',
    title: 'Phi-4 Technical Report',
    authors: ['Abdin', 'et al.'],
    categories: ['cs.CL', 'cs.AI'],
    publishedAt: '2024-12-12T00:00:00Z',
    url: 'https://arxiv.org/abs/2412.08905',
  },
  {
    type: 'paper',
    id: 'arxiv-2501-1',
    title: 'DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning',
    authors: ['DeepSeek-AI'],
    categories: ['cs.CL', 'cs.AI'],
    publishedAt: '2025-01-22T00:00:00Z',
    url: 'https://arxiv.org/abs/2501.12948',
  },
  {
    type: 'paper',
    id: 'arxiv-2212-1',
    title: 'Constitutional AI: Harmlessness from AI Feedback',
    authors: ['Bai', 'et al.'],
    categories: ['cs.AI', 'cs.LG'],
    publishedAt: '2022-12-15T00:00:00Z',
    url: 'https://arxiv.org/abs/2212.08073',
  },
  {
    type: 'paper',
    id: 'arxiv-2305-1',
    title: 'Mixture of Experts Meets Instruction Tuning: A Winning Combination for Large Language Models',
    authors: ['Shen', 'et al.'],
    categories: ['cs.CL'],
    publishedAt: '2023-05-24T00:00:00Z',
    url: 'https://arxiv.org/abs/2305.14705',
  },
]

// ─── AI Research: Discussions ───
const AI_DISCUSSIONS: FeedItem[] = [
  {
    type: 'discussion',
    id: 'hn-1',
    title: 'Ask HN: What are you building with local LLMs in 2026?',
    points: 847,
    commentCount: 312,
    source: 'HN',
    publishedAt: '2026-03-04T08:00:00Z',
    url: 'https://news.ycombinator.com/item?id=39000000',
  },
  {
    type: 'discussion',
    id: 'hn-2',
    title: 'Show HN: I built a Perplexity clone that runs entirely on-device',
    points: 412,
    commentCount: 89,
    source: 'HN',
    publishedAt: '2026-03-04T03:00:00Z',
    url: 'https://news.ycombinator.com/item?id=39000001',
  },
  {
    type: 'discussion',
    id: 'hn-3',
    title: 'The Bitter Lesson (2019) — still the most important essay in ML',
    points: 318,
    commentCount: 142,
    source: 'HN',
    publishedAt: '2026-03-03T22:00:00Z',
    url: 'https://news.ycombinator.com/item?id=39000002',
  },
  {
    type: 'discussion',
    id: 'lobsters-1',
    title: 'Writing a language model from scratch in Rust',
    points: 92,
    commentCount: 24,
    source: 'Lobste.rs',
    publishedAt: '2026-03-03T18:00:00Z',
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

// ─── AI Research: Release Updates ───
const RELEASE_UPDATES: NewsItem[] = [
  {
    type: 'news',
    id: 'ai-news-1',
    title: 'Anthropic releases Claude 3.7 Sonnet with extended thinking',
    source: 'Anthropic',
    category: 'Model Release',
    publishedAt: '2026-03-04T10:00:00Z',
    url: 'https://www.anthropic.com',
  },
  {
    type: 'news',
    id: 'ai-news-2',
    title: 'Google DeepMind releases Gemini 2.0 Flash with real-time audio',
    source: 'Google DeepMind',
    category: 'Model Release',
    publishedAt: '2026-03-03T15:00:00Z',
    url: 'https://deepmind.google',
  },
  {
    type: 'news',
    id: 'ai-news-3',
    title: 'Meta releases Llama 4 Scout with 10M context window',
    source: 'Meta AI',
    category: 'Model Release',
    publishedAt: '2026-03-02T12:00:00Z',
    url: 'https://ai.meta.com',
  },
  {
    type: 'news',
    id: 'ai-news-4',
    title: 'OpenAI o3 achieves 90th percentile on competitive programming benchmarks',
    source: 'OpenAI',
    category: 'Benchmark',
    publishedAt: '2026-03-01T09:00:00Z',
    url: 'https://openai.com',
  },
  {
    type: 'news',
    id: 'ai-news-5',
    title: 'Perplexity rolls out Deep Research mode in public beta',
    source: 'Perplexity',
    category: 'Product Launch',
    publishedAt: '2026-02-28T18:00:00Z',
    url: 'https://www.perplexity.ai',
  },
  {
    type: 'news',
    id: 'ai-news-6',
    title: 'NVIDIA ships CUDA 13 release candidate with new inference kernels',
    source: 'NVIDIA',
    category: 'Platform Release',
    publishedAt: '2026-02-27T20:00:00Z',
    url: 'https://developer.nvidia.com/cuda-toolkit',
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
    reportDate: '2026-03-03T00:00:00Z',
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
    reportDate: '2026-03-09T00:00:00Z',
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
    reportDate: '2026-03-01T00:00:00Z',
    epsActual: 2.15,
    epsEstimate: 2.22,
    revenueActual: 96400,
    revenueEstimate: 95800,
    beat: false,
    url: 'https://www.sec.gov/cgi-bin/browse-edgar',
  },
]

// ─── Startup Signals / Finance: Funding & Deals ───
const FUNDING: NewsItem[] = [
  {
    type: 'news',
    id: 'fund-1',
    title: 'Anduril raises $1.5B Series F at $28B valuation to accelerate defense AI',
    source: 'Axios Pro Rata',
    category: 'Startup · Series F',
    publishedAt: '2026-03-04T06:00:00Z',
    url: 'https://www.axios.com',
  },
  {
    type: 'news',
    id: 'fund-2',
    title: 'Perplexity closes $500M Series C led by SoftBank Vision Fund',
    source: 'TechCrunch',
    category: 'Startup · Series C',
    publishedAt: '2026-03-03T14:00:00Z',
    url: 'https://techcrunch.com',
  },
  {
    type: 'news',
    id: 'fund-3',
    title: 'xAI raises $6B in new funding round as Grok 3 gains traction',
    source: 'The Information',
    category: 'Startup · Strategic',
    publishedAt: '2026-03-02T10:00:00Z',
    url: 'https://www.theinformation.com',
  },
  {
    type: 'news',
    id: 'fund-4',
    title: 'TerraPower breaks ground on Natrium reactor in Wyoming',
    source: 'Axios',
    category: 'Startup · Energy',
    publishedAt: '2026-03-01T08:00:00Z',
    url: 'https://www.axios.com',
  },
]

const AI_NEWS: NewsItem[] = [...RELEASE_UPDATES, ...FUNDING].sort(
  (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
)

// ─── Macro: Indicators ───
const MACRO_INDICATORS: FeedItem[] = [
  {
    type: 'news',
    id: 'macro-1',
    title: 'CPI (Jan 2026): +0.3% MoM, +3.1% YoY — above expectations of +2.9%',
    source: 'FRED / BLS',
    category: 'CPI',
    publishedAt: '2026-02-14T13:00:00Z',
    url: 'https://fred.stlouisfed.org',
  },
  {
    type: 'news',
    id: 'macro-2',
    title: 'Unemployment Rate (Jan 2026): 4.1% — unchanged from prior month',
    source: 'FRED / BLS',
    category: 'Employment',
    publishedAt: '2026-02-07T13:00:00Z',
    url: 'https://fred.stlouisfed.org',
  },
  {
    type: 'news',
    id: 'macro-3',
    title: 'PCE Deflator (Dec 2025): +2.6% YoY — Fed target remains 2%',
    source: 'FRED / BEA',
    category: 'PCE',
    publishedAt: '2026-01-31T13:00:00Z',
    url: 'https://fred.stlouisfed.org',
  },
]

// ─── Registry: maps apiPath → items ───
export const MOCK_DATA: Record<string, FeedItem[]> = {
  '/api/ai-research/papers': PAPERS,
  '/api/ai-research/discussions': AI_DISCUSSIONS,
  '/api/ai-research/repos': AI_REPOS,
  '/api/ai-research/ai-news': AI_NEWS,
  '/api/finance/earnings': EARNINGS,
  '/api/finance/deals': FUNDING,
  '/api/finance/reports': [],
  '/api/markets/earnings-calendar': EARNINGS,
  '/api/macro/indicators': MACRO_INDICATORS,
}

export function getMockSection(apiPath: string): SectionData {
  return {
    items: MOCK_DATA[apiPath] ?? [],
    fetchedAt: new Date().toISOString(),
  }
}
