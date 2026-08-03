import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchMarketThesisDetail } from '@/lib/server/world-memory'

export const dynamic = 'force-dynamic'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    const thesis = await fetchMarketThesisDetail(user.id, id)
    if (!thesis) return NextResponse.json({ error: 'Market thesis not found' }, { status: 404 })
    return NextResponse.json(thesis)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load market thesis' }, { status: 500 })
  }
}
