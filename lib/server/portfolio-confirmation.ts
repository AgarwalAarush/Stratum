import { createHash } from 'node:crypto'
import { getSupabaseClient } from './supabase.ts'
import {
  parsePositionCsv,
  validatePortfolioConfirmation,
  budgetPortfolioConfirmation,
} from '../markets/portfolio-confirmation.ts'

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
