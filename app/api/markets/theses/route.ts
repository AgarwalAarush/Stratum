import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import {
  fetchThesisWorkspace,
  proposeUserAuthoredThesis,
  reviewThesis,
  updateThesisMonitorStatus,
} from '@/lib/server/theses'
import { enqueueAgentJob } from '@/lib/server/agent-jobs'
import { thesisEntityKey, userAuthoredThesisContent } from '@/lib/markets/theses'
import type { InvestmentThesis, ThesisEntityType, ThesisIntakeDraft } from '@/lib/markets/types'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json() as Record<string, unknown>
    if (body.action === 'create') {
      const entityType: ThesisEntityType = body.entityType === 'sub_industry' ? 'sub_industry' : 'stock'
      const draft: ThesisIntakeDraft = {
        entityType,
        symbol: typeof body.symbol === 'string' ? body.symbol : undefined,
        sector: typeof body.sector === 'string' ? body.sector : undefined,
        subIndustry: typeof body.subIndustry === 'string' ? body.subIndustry : undefined,
        statement: typeof body.statement === 'string' ? body.statement : '',
        mispricing: typeof body.mispricing === 'string' ? body.mispricing : undefined,
        keyDebate: typeof body.keyDebate === 'string' ? body.keyDebate : undefined,
        fastestKillSignal: typeof body.fastestKillSignal === 'string' ? body.fastestKillSignal : undefined,
      }
      if (user.id === 'local-development-user') {
        const generatedAt = new Date().toISOString()
        const proposal: InvestmentThesis = {
          id: crypto.randomUUID(),
          entityType,
          entityKey: thesisEntityKey(entityType, draft),
          symbol: entityType === 'stock' ? draft.symbol?.trim().toUpperCase() ?? null : null,
          sector: draft.sector?.trim() || null,
          subIndustry: draft.subIndustry?.trim() || null,
          version: 1,
          status: 'proposed',
          trigger: 'user-authored',
          content: userAuthoredThesisContent(draft),
          sources: [],
          dataAsOf: generatedAt,
          generatedAt,
          reviewedAt: null,
          researchNoteId: null,
        }
        return NextResponse.json({ thesis: proposal })
      }
      const thesis = await proposeUserAuthoredThesis(user.id, draft)
      if (!thesis) throw new Error('Unable to save this thesis')
      let researchQueued = false
      if (thesis.symbol) {
        try {
          await enqueueAgentJob('generate-company-research', {
            ownerId: user.id,
            symbol: thesis.symbol,
            reason: 'thesis-intake',
          }, `generate-company-research:${user.id}:${thesis.symbol}:${new Date().toISOString().slice(0, 10)}`)
          researchQueued = true
        } catch {
          // The authored proposal is durable even if background enrichment is temporarily unavailable.
        }
      }
      return NextResponse.json({
        thesis,
        researchQueued,
        workspace: await fetchThesisWorkspace(user.id),
      })
    }
    if (body.action === 'set-monitor-status') {
      const monitorId = typeof body.monitorId === 'string' ? body.monitorId.trim() : ''
      const status = body.status === 'active' || body.status === 'paused' ? body.status : null
      if (!monitorId || !status) throw new Error('A thesis monitor and status are required')
      if (user.id === 'local-development-user') {
        return NextResponse.json({ monitor: { id: monitorId, status } })
      }
      return NextResponse.json({ monitor: await updateThesisMonitorStatus(user.id, monitorId, status) })
    }
    const thesisId = typeof body.thesisId === 'string' ? body.thesisId.trim() : ''
    const decision = body.decision === 'accept' || body.decision === 'reject' ? body.decision : null
    if (!thesisId || !decision) throw new Error('A thesis proposal and review decision are required')
    if (user.id === 'local-development-user') {
      return NextResponse.json({ thesis: { id: thesisId, status: decision === 'accept' ? 'accepted' : 'rejected' } })
    }
    const thesis = await reviewThesis(user.id, thesisId, decision)
    return NextResponse.json({ thesis, workspace: await fetchThesisWorkspace(user.id) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to review thesis' }, { status: 400 })
  }
}
