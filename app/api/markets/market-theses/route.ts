import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchMarketThesisWorkspace } from '@/lib/server/world-memory'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const workspace = await fetchMarketThesisWorkspace(user.id)
    return NextResponse.json({ hypotheses: workspace.hypotheses, theses: workspace.theses })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load market theses' }, { status: 500 })
  }
}
