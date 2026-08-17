import { NextRequest, NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { fetchWorldNode } from '@/lib/server/world-projection'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!/^[a-z0-9._-]{1,160}$/i.test(id)) return NextResponse.json({ error: 'Invalid world node ID' }, { status: 400 })
  try {
    const node = await fetchWorldNode(id)
    return node ? NextResponse.json(node, { headers: { 'Cache-Control': 'private, no-store' } }) : NextResponse.json({ error: 'World node not found' }, { status: 404 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load the world node' }, { status: 500 })
  }
}
