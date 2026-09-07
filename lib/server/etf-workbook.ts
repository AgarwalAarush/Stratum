import { strFromU8, unzipSync } from 'fflate'
import { parseHTML } from 'linkedom'
import type { EtfHolding } from '../markets/types.ts'

/** Read issuer column labels, not positions. No cached or current date fallback. */
export function parseStateStreetHoldings(
  bytes: Uint8Array,
  expectedSymbol: string,
) {
  const archive = unzipSync(bytes)
  const sheet = archive['xl/worksheets/sheet1.xml']
  if (!sheet) throw new Error('Issuer workbook has no primary worksheet')
  const strings = archive['xl/sharedStrings.xml']
    ? [
        ...parseHTML(
          strFromU8(archive['xl/sharedStrings.xml']),
        ).document.querySelectorAll('si'),
      ].map((n) => n.textContent ?? '')
    : []
  const rows = [
    ...parseHTML(strFromU8(sheet)).document.querySelectorAll('row'),
  ].map((row) => {
    const cells: Record<string, string> = {}
    for (const cell of row.querySelectorAll('c')) {
      const col = cell.getAttribute('r')?.replace(/\d/g, '')
      if (!col) continue
      const value = cell.querySelector('v')?.textContent ?? ''
      cells[col] =
        cell.getAttribute('t') === 's'
          ? (strings[Number(value)] ?? '')
          : cell.getAttribute('t') === 'inlineStr'
            ? (cell.textContent ?? '')
            : value
    }
    return cells
  })
  if (rows.find((r) => r.A === 'Ticker Symbol:')?.B !== expectedSymbol)
    throw new Error('Issuer workbook ticker mismatch')
  const asOf = rows
    .find((r) => r.A === 'Holdings:')
    ?.B.replace(/^As of\s+/i, '')
  if (!asOf || !Number.isFinite(Date.parse(`${asOf} UTC`)))
    throw new Error('Issuer workbook holdings date missing')
  const headerIndex = rows.findIndex(
    (r) =>
      Object.values(r).includes('Ticker') &&
      Object.values(r).includes('Weight'),
  )
  if (headerIndex < 0)
    throw new Error('Issuer workbook holdings columns missing')
  const columns = Object.fromEntries(
    Object.entries(rows[headerIndex]).map(([key, value]) => [value, key]),
  )
  const holdings: EtfHolding[] = []
  for (const row of rows.slice(headerIndex + 1)) {
    const weightText = row[columns.Weight],
      name = row[columns.Name]
    if (!weightText || !name) continue
    const weight = Number(weightText) / 100
    if (!Number.isFinite(weight) || weight <= 0) continue
    const symbol = row[columns.Ticker]
    holdings.push({
      name,
      symbol: symbol && symbol !== '-' ? symbol : null,
      identifier: row[columns.Identifier] || null,
      classification:
        row[columns.Sector] && row[columns.Sector] !== '-'
          ? row[columns.Sector]
          : null,
      weight,
      shares: row[columns['Shares Held']]
        ? Number(row[columns['Shares Held']])
        : null,
      marketValue: null,
    })
  }
  return {
    holdings,
    dataAsOf: new Date(Date.parse(`${asOf} UTC`)).toISOString(),
    fundName: rows.find((r) => r.A === 'Fund Name:')?.B ?? 'State Street ETF',
  }
}
