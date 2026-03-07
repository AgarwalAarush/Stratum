import type { RepoItem } from '../types.ts'

const GITHUB_SEARCH_URL = 'https://api.github.com/search/repositories'
const SEARCH_TIMEOUT_MS = 10_000
const MAX_CANDIDATES = 100
const MIN_TOTAL_STARS = 50
const MAX_TOTAL_STARS = 15_000
const EMERGING_WINDOW_DAYS = 183
const STAR_RATE_WEIGHT = 0.8
const STAR_COUNT_WEIGHT = 0.2
const MOMENTUM_PRECISION = 10

interface GitHubRepoOwner {
  login?: string
}

interface GitHubSearchRepo {
  full_name?: string
  owner?: GitHubRepoOwner
  name?: string
  description?: string
  language?: string
  stargazers_count?: number
  html_url?: string
  created_at?: string
}

interface GitHubSearchResponse {
  items?: GitHubSearchRepo[]
}

interface ScoredRepo {
  item: RepoItem
  score: number
}

function parseOwnerAndName(raw: GitHubSearchRepo): { owner: string; name: string } | null {
  if (raw.full_name && raw.full_name.includes('/')) {
    const [owner, name] = raw.full_name.split('/')
    if (owner && name) return { owner, name }
  }

  if (raw.owner?.login && raw.name) {
    return { owner: raw.owner.login, name: raw.name }
  }

  return null
}

function parseDate(value?: string): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function floorDateToUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function createdAfterDate(now: Date): string {
  const threshold = new Date(now.getTime() - EMERGING_WINDOW_DAYS * 24 * 60 * 60 * 1_000)
  return floorDateToUtc(threshold).toISOString().slice(0, 10)
}

export function ageDaysFromCreatedAt(createdAt: string, now: Date = new Date()): number {
  const created = parseDate(createdAt)
  if (!created) return 1

  const ageMs = now.getTime() - created.getTime()
  if (ageMs <= 0) return 1

  return Math.max(1, ageMs / (24 * 60 * 60 * 1_000))
}

export function starsPerDay(totalStars: number, createdAt: string, now: Date = new Date()): number {
  const value = totalStars / ageDaysFromCreatedAt(createdAt, now)
  return Math.round(value * MOMENTUM_PRECISION) / MOMENTUM_PRECISION
}

export function scoreRepoMomentum(totalStars: number, createdAt: string, now: Date = new Date()): number {
  const ageDays = ageDaysFromCreatedAt(createdAt, now)
  const starRate = totalStars / ageDays
  const countBoost = Math.log10(totalStars + 1)
  return STAR_RATE_WEIGHT * starRate + STAR_COUNT_WEIGHT * countBoost
}

export function isEmergingRepoCandidate(raw: GitHubSearchRepo, now: Date = new Date()): boolean {
  const totalStars = raw.stargazers_count ?? 0
  if (totalStars < MIN_TOTAL_STARS || totalStars > MAX_TOTAL_STARS) return false

  const created = parseDate(raw.created_at)
  if (!created) return false

  const ageMs = now.getTime() - created.getTime()
  if (ageMs < 0) return true

  const ageDays = ageMs / (24 * 60 * 60 * 1_000)
  return ageDays <= EMERGING_WINDOW_DAYS
}

export function normalizeGithubSearchRepo(raw: GitHubSearchRepo, now: Date = new Date()): RepoItem | null {
  const parsed = parseOwnerAndName(raw)
  if (!parsed) return null

  const totalStars = raw.stargazers_count ?? 0
  const createdAt = raw.created_at ?? now.toISOString()

  return {
    type: 'repo',
    id: `repo-${parsed.owner}-${parsed.name}`.toLowerCase(),
    owner: parsed.owner,
    name: parsed.name,
    description: raw.description || 'No description provided',
    language: raw.language || 'Unknown',
    starsPerDay: starsPerDay(totalStars, createdAt, now),
    totalStars,
    url: raw.html_url || `https://github.com/${parsed.owner}/${parsed.name}`,
  }
}

function githubSearchQuery(now: Date): string {
  const createdAfter = createdAfterDate(now)

  return [
    'topic:ai',
    'llm in:name,description',
    `created:>=${createdAfter}`,
    `stars:${MIN_TOTAL_STARS}..${MAX_TOTAL_STARS}`,
    'fork:false',
    'archived:false',
    'mirror:false',
  ].join(' ')
}

function fallbackGithubSearchQuery(now: Date): string {
  const createdAfter = createdAfterDate(now)

  return [
    'topic:llm',
    `created:>=${createdAfter}`,
    `stars:${MIN_TOTAL_STARS}..${MAX_TOTAL_STARS}`,
    'fork:false',
    'archived:false',
    'mirror:false',
  ].join(' ')
}

async function runGitHubSearch(
  query: string,
  limit: number,
  headers: HeadersInit,
): Promise<Response | null> {
  const params = new URLSearchParams({
    q: query,
    sort: 'stars',
    order: 'desc',
    per_page: String(Math.min(MAX_CANDIDATES, Math.max(limit * 4, limit))),
  })

  try {
    return await fetch(`${GITHUB_SEARCH_URL}?${params.toString()}`, {
      headers,
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })
  } catch {
    return null
  }
}

async function fetchGitHubRepos(limit: number): Promise<GitHubSearchRepo[] | null> {
  try {
    const now = new Date()
    const token = process.env.GITHUB_TOKEN
    const headers: HeadersInit = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Stratum/0.2',
      'X-GitHub-Api-Version': '2022-11-28',
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const primary = await runGitHubSearch(githubSearchQuery(now), limit, headers)
    if (!primary) return null

    let response = primary
    if (response.status === 422) {
      const fallback = await runGitHubSearch(fallbackGithubSearchQuery(now), limit, headers)
      if (!fallback) return null
      response = fallback
    }

    if (!response.ok) return null

    const data = (await response.json()) as GitHubSearchResponse
    return Array.isArray(data.items) ? data.items : null
  } catch {
    return null
  }
}

export async function fetchTrendingRepos(limit = 20): Promise<RepoItem[] | null> {
  const now = new Date()
  const rawRepos = await fetchGitHubRepos(limit)
  if (rawRepos === null) return null

  const normalized = rawRepos
    .filter((repo) => isEmergingRepoCandidate(repo, now))
    .map((repo) => {
      const item = normalizeGithubSearchRepo(repo, now)
      if (!item) return null

      return {
        item,
        score: scoreRepoMomentum(item.totalStars, repo.created_at ?? now.toISOString(), now),
      } as ScoredRepo
    })
    .filter((entry): entry is ScoredRepo => entry !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.item.totalStars - a.item.totalStars
    })
    .map((entry) => entry.item)

  return normalized.slice(0, limit)
}
