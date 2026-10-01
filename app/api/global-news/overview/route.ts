import { fetchLatestDailyIntelligence } from '../../../../lib/data/overview-persistence.ts'
import { sectionJsonResponse } from '../../../../lib/server/http-cache.ts'

export async function GET() {
  try {
    const data = await fetchLatestDailyIntelligence('daily:global-news')
    return sectionJsonResponse(data, 'slow', data.stale ? 'stale' : data.bullets.length ? 'fresh' : 'none')
  } catch {
    return sectionJsonResponse({ bullets: [], fetchedAt: '', generatedAt: null, readiness: 'failed', errors: ['Intelligence storage unavailable'] }, 'slow', 'none')
  }
}
