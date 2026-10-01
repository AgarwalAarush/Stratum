import { exchangeSessionClose, type ExchangeSession } from './market-sessions.ts'
export const AGING_CHECKPOINTS = ['1w', '2w', '1m', '2m', '3m', '6m', '1y'] as const
export type AgingCheckpoint = typeof AGING_CHECKPOINTS[number]
/** Exchange-local issuance date; calendar anniversaries clamp instead of overflowing. */
export function checkpointDate(issuedAt: string, checkpoint: AgingCheckpoint): string {
  if (!AGING_CHECKPOINTS.includes(checkpoint) || !Number.isFinite(Date.parse(issuedAt))) throw new Error('Invalid aging anniversary')
  const issuedDate = new Date(issuedAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const [year, month, day] = issuedDate.split('-').map(Number)
  if (checkpoint.endsWith('w')) return new Date(Date.UTC(year, month - 1, day + Number(checkpoint[0]) * 7)).toISOString().slice(0, 10)
  const months = checkpoint === '1y' ? 12 : Number(checkpoint[0])
  const first = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay))).toISOString().slice(0, 10)
}
export function agingEndpoint(sessions: ExchangeSession[], date: string, now: Date, delayMs = 15 * 60_000): string | null {
  return sessions.filter(s => s.date <= date && exchangeSessionClose(s) + delayMs <= now.getTime()).map(s => s.date).sort().at(-1) ?? null
}
export function agingSemantics(action: string): 'descriptive' | 'hypothetical_exposure' | 'hypothetical_reduction' {
  return ['watch', 'research', 'no_trade'].includes(action) ? 'descriptive' : ['sell', 'trim'].includes(action) ? 'hypothetical_reduction' : 'hypothetical_exposure'
}
