export type ConfirmedPosition = {
  symbol: string
  quantity: number
  costBasisPerShare: number
}
export type PortfolioConfirmation = {
  asOf: string
  cash: number
  positions: ConfirmedPosition[]
  allocationBudget?: { total: number; holdingsValue: number }
}

/** Owner-authorized allocation capacity, distinct from settled broker cash. */
export function budgetPortfolioConfirmation(input: {
  asOf: string; total: number; holdingsValue: number; positions: ConfirmedPosition[]
}, now = new Date()): PortfolioConfirmation {
  if (!Number.isFinite(input.total) || input.total <= 0 ||
      !Number.isFinite(input.holdingsValue) || input.holdingsValue < 0 || input.holdingsValue > input.total ||
      (input.positions.length === 0 && input.holdingsValue !== 0))
    throw new Error('Investment budget must cover the stated holdings value')
  return validatePortfolioConfirmation({
    asOf: input.asOf, positions: input.positions,
    cash: Math.round((input.total - input.holdingsValue) * 100) / 100,
    allocationBudget: { total: input.total, holdingsValue: input.holdingsValue },
  }, now)
}

/** Deliberately small interchange format. Quoted CSV fields and CRLF work;
 * silently discarding unknown columns, duplicates, or malformed rows does not. */
export function parsePositionCsv(csv: string): ConfirmedPosition[] {
  if (csv.length > 100_000) throw new Error('Holdings CSV exceeds 100 KB')
  if (!csv.trim()) return []
  const rows: string[][] = []
  let row: string[] = [],
    field = '',
    quoted = false,
    closedQuote = false
  for (let i = 0; i <= csv.length; i++) {
    const c = csv[i]
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') {
        field += '"'
        i++
      } else if (quoted) {
        quoted = false
        closedQuote = true
      } else {
        if (field.trim() || closedQuote)
          throw new Error('Malformed CSV quote')
        quoted = true
      }
    } else if (!quoted && (c === ',' || c === '\n' || c === undefined)) {
      row.push(field.trim())
      field = ''
      closedQuote = false
      if (c !== ',') {
        if (row.some(Boolean)) rows.push(row)
        row = []
      }
    } else if (c !== undefined) {
      if (closedQuote && c.trim())
        throw new Error('Unexpected text after CSV quote')
      field += c
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote')
  if (
    rows
      .shift()
      ?.map((s) => s.toLowerCase())
      .join(',') !== 'symbol,quantity,cost_basis_per_share'
  )
    throw new Error(
      'CSV headers must be symbol,quantity,cost_basis_per_share',
    )
  return rows.map((r, i) => {
    if (r.length !== 3 || !r[1] || !r[2])
      throw new Error(`Invalid holdings row ${i + 2}`)
    return {
      symbol: r[0].toUpperCase(),
      quantity: Number(r[1]),
      costBasisPerShare: Number(r[2]),
    }
  })
}

export function validatePortfolioConfirmation(
  input: PortfolioConfirmation,
  now = new Date(),
): PortfolioConfirmation {
  const time = Date.parse(input.asOf)
  if (
    !Number.isFinite(time) ||
    time > now.getTime() ||
    now.getTime() - time > 7 * 86400000
  )
    throw new Error(
      'Capture time must be within the past seven days and cannot be in the future',
    )
  if (!Number.isFinite(input.cash) || input.cash < 0)
    throw new Error('Confirmed cash must be non-negative')
  if (input.allocationBudget) {
    const {total, holdingsValue} = input.allocationBudget
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(holdingsValue) || holdingsValue < 0 || holdingsValue > total || Math.abs(input.cash - (total - holdingsValue)) > 0.011)
      throw new Error('Available allocation must reconcile to the investment budget')
  }
  if (!Array.isArray(input.positions) || input.positions.length > 750)
    throw new Error('Expected at most 750 positions')
  const seen = new Set<string>()
  for (const p of input.positions) {
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(p.symbol) || seen.has(p.symbol))
      throw new Error('Invalid or duplicate symbol')
    seen.add(p.symbol)
    if (
      !Number.isFinite(p.quantity) ||
      p.quantity <= 0 ||
      !Number.isFinite(p.costBasisPerShare) ||
      p.costBasisPerShare < 0
    )
      throw new Error(
        'Each position needs positive quantity and non-negative cost basis',
      )
  }
  return { ...input, asOf: new Date(time).toISOString() }
}
