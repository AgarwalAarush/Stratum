import type { PortfolioTransactionAction } from './types.ts'

export interface ParsedPortfolioUpdate {
  action: Exclude<PortfolioTransactionAction, 'position_import'>
  symbol: string | null
  quantity: number | null
  pricePerShare: number | null
  fees: number
  occurredAt: string
  notes: string
}

const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,11}$/
const MONEY_PATTERN = /\$?([\d,]+(?:\.\d{1,4})?)(?:\s*(k|m))?/i

function amount(value: string | undefined): number | null {
  if (!value) return null
  const match = value.match(MONEY_PATTERN)
  if (!match) return null
  const multiplier = match[2]?.toLowerCase() === 'm' ? 1_000_000 : match[2]?.toLowerCase() === 'k' ? 1_000 : 1
  const parsed = Number(match[1]?.replaceAll(',', '')) * multiplier
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function dateOrToday(value: string | undefined, now: Date): string {
  if (!value) return now.toISOString().slice(0, 10)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? now.toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10)
}

export function parsePortfolioUpdate(input: string, now = new Date()): ParsedPortfolioUpdate | null {
  const clean = input.trim().replace(/\s+/g, ' ')
  if (!clean) return null
  const dated = clean.match(/(?:on|dated)\s+(\d{4}-\d{2}-\d{2})\b/i)
  const occurredAt = dateOrToday(dated?.[1], now)
  const cash = clean.match(/^(deposit|add|fund|withdraw|remove)\s+\$?([\d,.]+(?:\s*[km])?)\s*(?:cash|dollars?|usd)?(?:\s+(?:to|from)\s+.+)?$/i)
  if (cash) {
    const value = amount(cash[2])
    if (!value) return null
    const withdrawal = /withdraw|remove/i.test(cash[1] ?? '')
    return {
      action: withdrawal ? 'cash_withdrawal' : 'cash_deposit',
      symbol: null,
      quantity: null,
      pricePerShare: value,
      fees: 0,
      occurredAt,
      notes: clean,
    }
  }
  const trade = clean.match(/^(buy|bought|sell|sold)\s+([\d,.]+)\s*(?:shares?\s+(?:of\s+)?)?([A-Za-z][A-Za-z0-9.-]{0,11})\s+(?:at|@)\s+\$?([\d,.]+)(?:\s*(?:per share|\/share))?(?:\s*(?:\+\s*|with\s+)?(?:\$?([\d,.]+)\s*)?(?:fee|fees))?(?:\s+(?:on|dated)\s+\d{4}-\d{2}-\d{2})?$/i)
  if (!trade) return null
  const quantity = amount(trade[2])
  const pricePerShare = amount(trade[4])
  const fees = amount(trade[5]) ?? 0
  const symbol = trade[3]?.toUpperCase() ?? ''
  if (!quantity || !pricePerShare || !SYMBOL_PATTERN.test(symbol)) return null
  return {
    action: /sell|sold/i.test(trade[1] ?? '') ? 'sell' : 'buy',
    symbol,
    quantity,
    pricePerShare,
    fees,
    occurredAt,
    notes: clean,
  }
}

export function validatePortfolioUpdate(input: ParsedPortfolioUpdate): string | null {
  if (!['cash_deposit', 'cash_withdrawal', 'buy', 'sell'].includes(input.action)) return 'Choose a supported cash or trade action'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredAt)) return 'Choose a valid transaction date'
  if (!Number.isFinite(input.fees) || input.fees < 0) return 'Fees must be a non-negative number'
  if (input.action === 'cash_deposit' || input.action === 'cash_withdrawal') {
    return input.pricePerShare && input.pricePerShare > 0 ? null : 'Enter a positive cash amount'
  }
  if (!input.symbol || !SYMBOL_PATTERN.test(input.symbol)) return 'Enter a valid stock symbol'
  if (!input.quantity || input.quantity <= 0 || !input.pricePerShare || input.pricePerShare <= 0) return 'Enter positive shares and price'
  return null
}
