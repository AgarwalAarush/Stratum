import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import {
  createSavedScreenerScreen,
  deleteSavedScreenerScreen,
  fetchSavedScreenerScreens,
  updateSavedScreenerScreen,
} from '@/lib/server/saved-screens'

export const dynamic = 'force-dynamic'

function text(value: unknown, maximum = 100): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

export async function GET() {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ screens: await fetchSavedScreenerScreens(user.id) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load saved screens' }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json() as Record<string, unknown>
    if (body.action === 'create') {
      return NextResponse.json({ screen: await createSavedScreenerScreen(user.id, { name: body.name, query: body.query }) }, { status: 201 })
    }
    if (body.action === 'update') {
      return NextResponse.json({ screen: await updateSavedScreenerScreen(user.id, text(body.id), { name: body.name, query: body.query }) })
    }
    if (body.action === 'delete') {
      await deleteSavedScreenerScreen(user.id, text(body.id))
      return NextResponse.json({ deleted: true })
    }
    throw new Error('Unsupported saved-screen action')
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update saved screens' }, { status: 400 })
  }
}
