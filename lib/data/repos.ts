import type { RepoItem } from '../types'

const PRIMARY_TRENDING_URL = 'https://api.gitterapp.com/repositories?language=python&since=daily'
const FALLBACK_TRENDING_URL = 'https://gh-trending-api.herokuapp.com/repositories/python?since=daily'

interface RawRepo {
  author?: string
  name?: string
  fullName?: string
  description?: string
  language?: string
  stars?: number
  totalStars?: number
  currentPeriodStars?: number
  starsToday?: number
  forks?: number
  url?: string
}

function parseOwnerAndName(raw: RawRepo): { owner: string; name: string } | null {
  if (raw.fullName && raw.fullName.includes('/')) {
    const [owner, name] = raw.fullName.split('/')
    if (owner && name) return { owner, name }
  }

  if (raw.author && raw.name) {
    return { owner: raw.author, name: raw.name }
  }

  return null
}

export function normalizeTrendingRepo(raw: RawRepo): RepoItem | null {
  const parsed = parseOwnerAndName(raw)
  if (!parsed) return null

  const totalStars = raw.stars ?? raw.totalStars ?? 0
  const starsToday = raw.currentPeriodStars ?? raw.starsToday ?? 0

  return {
    type: 'repo',
    id: `repo-${parsed.owner}-${parsed.name}`.toLowerCase(),
    owner: parsed.owner,
    name: parsed.name,
    description: raw.description || 'No description provided',
    language: raw.language || 'Unknown',
    starsToday,
    totalStars,
    url: raw.url || `https://github.com/${parsed.owner}/${parsed.name}`,
  }
}

async function fetchTrending(url: string): Promise<RawRepo[] | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Stratum/0.2',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) return null
    const data = await response.json()
    return Array.isArray(data) ? (data as RawRepo[]) : null
  } catch {
    return null
  }
}

export async function fetchTrendingRepos(limit = 20): Promise<RepoItem[]> {
  const primary = await fetchTrending(PRIMARY_TRENDING_URL)
  const rawRepos = primary ?? (await fetchTrending(FALLBACK_TRENDING_URL)) ?? []

  const normalized = rawRepos
    .map(normalizeTrendingRepo)
    .filter((repo): repo is RepoItem => repo !== null)

  normalized.sort((a, b) => {
    if (b.starsToday !== a.starsToday) return b.starsToday - a.starsToday
    return b.totalStars - a.totalStars
  })

  return normalized.slice(0, limit)
}
