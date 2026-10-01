import { MARKETS_OWNER_ID } from '../auth/markets-auth.ts'
import { newspaperAnalysis, newspaperPortfolio, type NewspaperExport, type PublishedNewspaperAnalysis } from '../markets/newspaper-export.ts'
import type { PortfolioAccountSummary } from '../markets/types.ts'
import { fetchAuthoritativePortfolios } from './portfolio.ts'
import { fetchPublishedNewspaperAnalysis } from './recommendation-reads.ts'

const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vary': 'Cookie',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, noarchive',
}

type Dependencies = {
  authenticate: () => Promise<{ id: string } | null>
  portfolios?: (ownerId: string) => Promise<PortfolioAccountSummary[]>
  analysis?: (ownerId: string) => Promise<PublishedNewspaperAnalysis | null>
  now?: () => Date
}

/** Request boundary is independently testable; production binds existing auth.
 * No caller-supplied owner, portfolio selection, credentials or refresh flags. */
export async function serveNewspaperExport(request: Request, dependencies: Dependencies): Promise<Response> {
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: privateHeaders })
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  let user
  try { user = await dependencies.authenticate() } catch { return json({ error: 'Unauthorized' }, 401) }
  if (!user || user.id !== MARKETS_OWNER_ID) return json({ error: 'Unauthorized' }, 401)
  const origin = new URL(request.url).origin
  const requestOrigin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  if ((requestOrigin !== null && requestOrigin !== origin)
    || fetchSite === 'cross-site' || fetchSite === 'same-site') {
    return json({ error: 'Cross-origin export is not allowed' }, 403)
  }
  if (new URL(request.url).search) return json({ error: 'Export does not accept query parameters' }, 400)
  const now = dependencies.now?.() ?? new Date()
  try {
    const [portfolioResult, analysisResult] = await Promise.allSettled([
      (dependencies.portfolios ?? fetchAuthoritativePortfolios)(user.id),
      (dependencies.analysis ?? fetchPublishedNewspaperAnalysis)(user.id),
    ])
    // No partial / empty success for a failed authoritative holdings read.
    if (portfolioResult.status === 'rejected') throw new Error('Portfolio read failed')
    const portfolios = portfolioResult.value.map(portfolio => newspaperPortfolio(portfolio, now))
    let analysis, analysisFailed = analysisResult.status === 'rejected'
    try {
      analysis = newspaperAnalysis(analysisResult.status === 'fulfilled' ? analysisResult.value : null, now, analysisFailed)
    } catch {
      analysisFailed = true
      analysis = newspaperAnalysis(null, now, true)
    }
    const flags = [
      ...(portfolios.length ? [] : ['no_portfolios']),
      ...portfolios.flatMap(portfolio => portfolio.readiness.flags.map(flag => `${portfolio.id}:${flag}`)),
      ...analysis.readiness.flags.map(flag => `analysis:${flag}`),
    ]
    const result: NewspaperExport = {
      schemaVersion: 1, exportedAt: now.toISOString(), privacy: 'private-owner-only',
      portfolios, analysis, readiness: { ready: flags.length === 0, flags },
      errors: analysisFailed ? [{ scope: 'analysis', code: 'read_failed' }] : [],
    }
    return json(result)
  } catch {
    return json({ error: 'Authoritative portfolio export unavailable', errors: [{ scope: 'portfolio', code: 'read_failed' }] }, 503)
  }
}
