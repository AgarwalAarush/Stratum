import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/supabase-server'
import { enqueueAgentJob } from '@/lib/server/agent-jobs'
import { getSupabaseClient } from '@/lib/server/supabase'
import { addSymbolToPrimaryWatchlist } from '@/lib/server/portfolio'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json() as Record<string, unknown>
  const status = body.status as 'dismissed' | 'snoozed' | 'watchlisted' | 'promoted'
  if (!['dismissed', 'snoozed', 'watchlisted', 'promoted'].includes(status)) {
    return NextResponse.json({ error: 'Invalid candidate action' }, { status: 400 })
  }
  if (user.id === 'local-development-user') return NextResponse.json({ updated: true, status })
  const supabase = getSupabaseClient()
  if (!supabase) return NextResponse.json({ error: 'Persistence unavailable' }, { status: 503 })
  const { data: candidate, error } = await supabase.from('candidate_briefs').update({
    status,
    owner_id: user.id,
    snoozed_until: status === 'snoozed'
      ? new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
      : null,
  }).eq('id', id).select('symbol').single()
  if (error || !candidate) return NextResponse.json({ error: error?.message ?? 'Candidate not found' }, { status: 404 })
  if (status === 'promoted') {
    await enqueueAgentJob('generate-company-research', {
      ownerId: user.id,
      symbol: candidate.symbol,
      reason: 'candidate-promotion',
    })
  }
  if (status === 'watchlisted') await addSymbolToPrimaryWatchlist(user.id, candidate.symbol)
  return NextResponse.json({ updated: true, status })
}
