import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/supabase-server'
import {
  replaceUserWatchlists,
  saveThesisDecision,
  saveDecisionReview,
  updateInboxStatus,
  upsertManualPosition,
  addSymbolToPrimaryWatchlist,
} from '@/lib/server/portfolio'
import { createDefaultWatchlistState, parseWatchlistState } from '@/lib/markets/watchlists'

export const dynamic = 'force-dynamic'

function text(value: unknown, maximum = 1_000): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === '' || value === undefined) return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

export async function POST(request: Request) {
  const user = await getAllowedMarketUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json() as Record<string, unknown>
    const localDevelopment = user.id === 'local-development-user'
    if (body.action === 'replace-watchlists') {
      if (localDevelopment) {
        return NextResponse.json({ watchlists: parseWatchlistState(body.state, createDefaultWatchlistState([])) })
      }
      return NextResponse.json({ watchlists: await replaceUserWatchlists(user.id, body.state) })
    }
    if (body.action === 'save-position') {
      const symbol = text(body.symbol, 12).toUpperCase()
      const shares = Number(body.shares)
      const costBasisPerShare = Number(body.costBasisPerShare)
      if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol) || !(shares > 0) || costBasisPerShare < 0) {
        throw new Error('A valid symbol, positive shares, and non-negative cost basis are required')
      }
      if (localDevelopment) {
        return NextResponse.json({ position: {
          id: `local-position-${symbol}`,
          symbol,
          shares,
          costBasisPerShare,
          openedAt: text(body.openedAt, 10) || null,
          notes: text(body.notes),
          updatedAt: new Date().toISOString(),
        } })
      }
      return NextResponse.json({ position: await upsertManualPosition(user.id, {
        symbol,
        shares,
        costBasisPerShare,
        openedAt: text(body.openedAt, 10) || null,
        notes: text(body.notes),
      }) })
    }
    if (body.action === 'add-watchlist-symbol') {
      const symbol = text(body.symbol, 12).toUpperCase()
      if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) throw new Error('A valid symbol is required')
      if (localDevelopment) return NextResponse.json({ added: true, symbol })
      await addSymbolToPrimaryWatchlist(user.id, symbol)
      return NextResponse.json({ added: true, symbol })
    }
    if (body.action === 'save-decision') {
      const symbol = text(body.symbol, 12).toUpperCase()
      const disposition = body.disposition as 'own' | 'watch' | 'avoid'
      const formalRating = body.formalRating as 'BUY' | 'HOLD' | 'SELL' | 'NOT_RATED'
      const entryAction = body.entryAction as 'buy_now' | 'nibble' | 'wait' | 'add_on_weakness' | 'avoid'
      const conviction = nullableNumber(body.conviction)
      const entryZoneLow = nullableNumber(body.entryZoneLow)
      const entryZoneHigh = nullableNumber(body.entryZoneHigh)
      const killCriteria = Array.isArray(body.killCriteria) ? body.killCriteria.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const criterion = item as Record<string, unknown>
        const operator = criterion.operator as 'lt' | 'gt'
        const value = nullableNumber(criterion.value)
        const description = text(criterion.description, 1_000)
        if (!description || !['lt', 'gt'].includes(operator) || value === null) return []
        return [{
          id: text(criterion.id, 80) || `price-${operator}-${value}`,
          description,
          metric: 'price' as const,
          operator,
          value,
        }]
      }).slice(0, 10) : []
      if (
        !/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)
        || !['own', 'watch', 'avoid'].includes(disposition)
        || !['BUY', 'HOLD', 'SELL', 'NOT_RATED'].includes(formalRating)
        || !['buy_now', 'nibble', 'wait', 'add_on_weakness', 'avoid'].includes(entryAction)
        || (conviction !== null && (!Number.isInteger(conviction) || conviction < 1 || conviction > 5))
        || (entryZoneLow !== null && entryZoneHigh !== null && entryZoneLow > entryZoneHigh)
      ) throw new Error('The decision fields are invalid')
      if (localDevelopment) {
        return NextResponse.json({ decision: {
          id: `local-decision-${Date.now()}`,
          symbol,
          version: 1,
          disposition,
          formalRating,
          entryAction,
          fairValue: nullableNumber(body.fairValue),
          entryZoneLow,
          entryZoneHigh,
          conviction,
          nextCatalyst: text(body.nextCatalyst) || null,
          killCriteria,
          rationale: text(body.rationale, 4_000),
          priceAtDecision: null,
          createdAt: new Date().toISOString(),
        } })
      }
      return NextResponse.json({ decision: await saveThesisDecision(user.id, {
        symbol,
        disposition,
        formalRating,
        entryAction,
        fairValue: nullableNumber(body.fairValue),
        entryZoneLow,
        entryZoneHigh,
        conviction,
        nextCatalyst: text(body.nextCatalyst) || null,
        killCriteria,
        rationale: text(body.rationale, 4_000),
      }) })
    }
    if (body.action === 'save-review') {
      const outcome = body.outcome as 'working' | 'not_working' | 'invalidated' | 'closed'
      const decisionId = text(body.decisionId, 80)
      if (!decisionId || !['working', 'not_working', 'invalidated', 'closed'].includes(outcome)) {
        throw new Error('A valid decision and outcome are required')
      }
      const reviewInput = {
        decisionId,
        outcome,
        expectationAssessment: text(body.expectationAssessment, 4_000),
        lessons: text(body.lessons, 4_000),
        postmortem: text(body.postmortem, 8_000),
      }
      if (localDevelopment) {
        return NextResponse.json({ review: {
          id: `local-review-${decisionId}`,
          symbol: text(body.symbol, 12).toUpperCase(),
          ...reviewInput,
          reviewedAt: new Date().toISOString(),
        } })
      }
      return NextResponse.json({ review: await saveDecisionReview(user.id, reviewInput) })
    }
    if (body.action === 'update-inbox') {
      const status = body.status as 'open' | 'dismissed' | 'resolved'
      if (!['open', 'dismissed', 'resolved'].includes(status)) throw new Error('Invalid inbox status')
      if (localDevelopment) return NextResponse.json({ updated: true })
      await updateInboxStatus(user.id, text(body.itemId, 80), status)
      return NextResponse.json({ updated: true })
    }
    throw new Error('Unsupported portfolio action')
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update portfolio' }, { status: 400 })
  }
}
