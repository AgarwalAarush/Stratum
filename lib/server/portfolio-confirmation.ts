import { createHash } from 'node:crypto'
import { getSupabaseClient } from './supabase.ts'
import {
  parsePositionCsv,
  validatePortfolioConfirmation,
  budgetPortfolioConfirmation,
  reconfirmHoldings,
  type PortfolioConfirmation,
} from '../markets/portfolio-confirmation.ts'

/** Append an owner-confirmed unchanged holdings record; preserve capital provenance. */
export async function reconfirmManualHoldings(ownerId: string, portfolioId: string, requestId: string, now = new Date()) {
  const db = getSupabaseClient()
  if (!db) throw new Error('Portfolio store unavailable')
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)) throw new Error('Confirmation request ID required')
  const account = await db.from('portfolios').select('id,kind').eq('owner_id', ownerId).eq('id', portfolioId).single()
  if (account.error || !account.data || account.data.kind !== 'manual') throw new Error('Owned manual portfolio required')
  const prior = await db.from('portfolio_confirmations').select('id,portfolio_id,content').eq('owner_id',ownerId)
    .eq('request_id',requestId).maybeSingle()
  if (prior.error) throw new Error(prior.error.message)
  if (prior.data) {
    if (prior.data.portfolio_id !== portfolioId || prior.data.content.confirmationScope !== 'holdings')
      throw new Error('Request ID already belongs to a different confirmation')
    return {id:prior.data.id,reused:true}
  }
  const previous = await db.from('portfolio_confirmations').select('content,confirmed_at').eq('owner_id', ownerId)
    .eq('portfolio_id', portfolioId).order('confirmed_at', {ascending:false}).limit(1).single()
  if (previous.error) throw new Error('Saved holdings confirmation required')
  const changes = await db.from('portfolio_transactions').select('id').eq('owner_id', ownerId).eq('portfolio_id', portfolioId)
    .gt('created_at', previous.data.confirmed_at).limit(1)
  if (changes.error || changes.data.length) throw new Error('Holdings changed since confirmation; provide a complete updated snapshot')
  const snapshot = reconfirmHoldings(previous.data.content as PortfolioConfirmation, now)
  const result = await db.from('portfolio_confirmations').upsert({owner_id:ownerId,portfolio_id:portfolioId,request_id:requestId,
    as_of:snapshot.asOf,content:snapshot,content_hash:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')},
    {onConflict:'owner_id,request_id',ignoreDuplicates:true}).select('id').maybeSingle()
  if (result.error) throw new Error(result.error.message)
  return result.data ?? {reused:true}
}

export async function confirmManualPortfolio(
  ownerId: string,
  input: Record<string, unknown>,
) {
  const db = getSupabaseClient()
  if (!db) throw new Error('Portfolio store unavailable')
  if (input.confirmed !== true)
    throw new Error('Confirm that the holdings and cash are complete')
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      String(input.requestId),
    )
  )
    throw new Error('Confirmation request ID required')
  if (input.totalBudget === undefined && typeof input.cash !== 'number')
    throw new Error('Cash must be provided explicitly')
  const snapshot = input.totalBudget !== undefined ? budgetPortfolioConfirmation({
    asOf: String(input.asOf), total: input.totalBudget as number,
    holdingsValue: input.holdingsValue as number,
    positions: parsePositionCsv(String(input.csv ?? '')),
  }) : validatePortfolioConfirmation({
    asOf: String(input.asOf),
    cash: input.cash as number,
    positions: parsePositionCsv(String(input.csv ?? '')),
  })
  const account = await db
    .from('portfolios')
    .select('id,kind')
    .eq('owner_id', ownerId)
    .eq('id', String(input.portfolioId))
    .single()
  if (account.error || !account.data || account.data.kind !== 'manual')
    throw new Error('Only an owned manual portfolio can be confirmed here')
  const hash = createHash('sha256')
    .update(JSON.stringify(snapshot))
    .digest('hex')
  const prior = await db
    .from('portfolio_confirmations')
    .select('id,portfolio_id,content_hash')
    .eq('owner_id', ownerId)
    .eq('request_id', String(input.requestId))
    .maybeSingle()
  if (prior.error) throw new Error(prior.error.message)
  if (prior.data) {
    if (
      prior.data.content_hash !== hash ||
      prior.data.portfolio_id !== account.data.id
    )
      throw new Error(
        'Request ID already belongs to a different confirmation',
      )
    return { id: prior.data.id, reused: true }
  }
  const result = await db
    .from('portfolio_confirmations')
    .insert({
      owner_id: ownerId,
      portfolio_id: account.data.id,
      request_id: input.requestId,
      as_of: snapshot.asOf,
      content_hash: hash,
      content: snapshot,
    })
    .select('id')
    .single()
  if (result.error?.code === '23505')
    return confirmManualPortfolio(ownerId, input)
  if (result.error) throw new Error(result.error.message)
  return result.data
}
