import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { reviewThesis } from '@/lib/server/theses'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json() as Record<string, unknown>
    const thesisId = typeof body.thesisId === 'string' ? body.thesisId.trim() : ''
    const decision = body.decision === 'accept' || body.decision === 'reject' ? body.decision : null
    if (!thesisId || !decision) throw new Error('A thesis proposal and review decision are required')
    if (user.id === 'local-development-user') {
      return NextResponse.json({ thesis: { id: thesisId, status: decision === 'accept' ? 'accepted' : 'rejected' } })
    }
    return NextResponse.json({ thesis: await reviewThesis(user.id, thesisId, decision) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to review thesis' }, { status: 400 })
  }
}
