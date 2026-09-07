import {
  registerInvestmentExperiment,
  reviewInvestmentExperiment,
} from '@/lib/server/investment-learning'
import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import {
  fetchRecommendationWorkspace,
  recordRecommendationOwnerEvent,
  record,
} from '@/lib/server/recommendations'
import { adjudicateRecommendationForecast } from '@/lib/server/recommendation-outcomes'
export const dynamic = 'force-dynamic'
export async function GET() {
  const user = await getAllowedMarketUser()
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await fetchRecommendationWorkspace(user.id), {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch {
    return NextResponse.json(
      {
        error:
          'Recommendations are temporarily unavailable. Existing holdings have not been evaluated.',
      },
      { status: 503 },
    )
  }
}
export async function POST(request: Request) {
  const user = await getAllowedMarketUser()
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  try {
    const input = record(await request.json())
    const result =
      input.action === 'register-experiment'
        ? await registerInvestmentExperiment(user.id, input)
        : input.action === 'review-experiment'
          ? await reviewInvestmentExperiment(user.id, input)
          : input.action === 'adjudicate-forecast'
            ? await adjudicateRecommendationForecast(user.id, input)
            : await recordRecommendationOwnerEvent(user.id, input)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to record response',
      },
      { status: 400 },
    )
  }
}
