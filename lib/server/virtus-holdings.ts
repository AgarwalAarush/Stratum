import { parseHTML } from 'linkedom'
import * as XLSX from 'xlsx'
import { get as httpsGet } from 'node:https'
import type { EtfHolding } from '../markets/types.ts'

const ORIGIN = 'https://www.virtus.com'
const FUND_NAME = 'Virtus Reaves Utilities ETF'
export const VIRTUS_UTES_SUMMARY_URL = `${ORIGIN}/products/reaves-utilities-etf`

type Cell = string | number
function invalid(detail: string): never { throw new Error(`Invalid Virtus holdings workbook: ${detail}`) }

/** Parse the complete issuer XLS with the maintained SheetJS reader. Only
 * literal values are admitted; formulas and workbook code are never evaluated. */
function workbookRows(bytes: Uint8Array): Array<Map<number, Cell>> {
  if (bytes.length < 512 || bytes.length > 2 * 1024 * 1024 || Buffer.from(bytes.subarray(0, 8)).toString('hex') !== 'd0cf11e0a1b11ae1') invalid('expected an XLS compound file')
  const workbook = XLSX.read(bytes, {type: 'array', cellFormula: true, cellDates: false, raw: true, WTF: true})
  if (workbook.SheetNames.length !== 1 || workbook.Workbook?.Sheets?.some(sheet => sheet.Hidden)) invalid('expected one visible positions worksheet')
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!
  if (!sheet['!ref']) invalid('empty positions worksheet')
  const range = XLSX.utils.decode_range(sheet['!ref'])
  if (range.s.r !== 0 || range.s.c !== 0 || range.e.r >= 10_000 || range.e.c >= 256) invalid('invalid worksheet dimensions')
  const rows: Array<Map<number, Cell>> = []
  for (let row = 0; row <= range.e.r; row++) {
    const cells = new Map<number, Cell>()
    for (let column = 0; column <= range.e.c; column++) {
      const cell = sheet[XLSX.utils.encode_cell({r: row, c: column})] as XLSX.CellObject | undefined
      if (!cell || cell.t === 'z') continue
      if (cell.f || !['s', 'n'].includes(cell.t) || (typeof cell.v !== 'string' && typeof cell.v !== 'number') || (typeof cell.v === 'number' && !Number.isFinite(cell.v))) invalid('unsupported or invalid position cell')
      cells.set(column, cell.v as Cell)
    }
    rows.push(cells)
  }
  return rows
}

function issuerDate(value: string, now: Date): string {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) throw new Error('Virtus issuer date is missing or invalid')
  const [month, day, year] = match.slice(1).map(Number), date = new Date(Date.UTC(year!, month! - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day || date.getTime() > now.getTime()) throw new Error('Virtus issuer date is invalid or future-dated')
  return date.toISOString()
}

export function parseVirtusHoldings(bytes: Uint8Array, now = new Date()) {
  const rows = workbookRows(bytes)
  const dateLabel = String(rows[0]?.get(0) ?? '')
  const dataAsOf = issuerDate(dateLabel.replace(/^Positions as of /, ''), now)
  if (!dateLabel.startsWith('Positions as of ')) invalid('holdings date missing')
  const headerIndex = rows.findIndex(row => row?.get(0) === 'Account Name')
  if (headerIndex < 1) invalid('positions header missing')
  const columns = new Map([...rows[headerIndex]!.entries()].filter(([, value]) => typeof value === 'string').map(([column, value]) => [value, column]))
  for (const name of ['Account Name', 'Security Id', 'Name', 'Ticker', 'Security Type', 'Quantity', 'Weight']) if (!columns.has(name)) invalid(`missing ${name} column`)
  const marketColumn = [...rows[headerIndex - 1]!.entries()].find(([, value]) => value === 'Market Value')?.[0]
  if (marketColumn === undefined || rows[headerIndex]!.get(marketColumn + 1) !== '(Base)') invalid('base-currency market value column missing')
  const seen = new Set<string>()
  const holdings: EtfHolding[] = []
  for (let index = headerIndex + 1; index < rows.length; index++) {
    const row = rows[index]
    if (!row) invalid('missing position row')
    const cell = (name: string) => row.get(columns.get(name)!)
    const identifier = String(cell('Security Id') ?? '').trim(), name = String(cell('Name') ?? '').trim(), classification = String(cell('Security Type') ?? '').trim()
    const weightText = String(cell('Weight') ?? ''), shares = cell('Quantity'), marketValue = row.get(marketColumn + 1)
    if (cell('Account Name') !== FUND_NAME || !identifier || !name || !classification || seen.has(identifier)) invalid('wrong fund, duplicate or missing position identity')
    if (!/^-?\d+(?:\.\d+)?%$/.test(weightText) || typeof shares !== 'number' || typeof marketValue !== 'number') invalid('missing or invalid position values')
    seen.add(identifier)
    const symbol = String(cell('Ticker') ?? '').trim()
    if (symbol && !/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) invalid('invalid ticker')
    holdings.push({identifier, name, classification, symbol: symbol || null, shares, marketValue, weight: Number(weightText.slice(0, -1)) / 100})
  }
  const coveredWeight = holdings.reduce((sum, holding) => sum + holding.weight, 0)
  if (holdings.length < 5 || coveredWeight < 0.95 || coveredWeight > 1.02) invalid('holdings weights do not reconcile to a complete fund')
  return {holdings, holdingsCount: holdings.length, dataAsOf, fundName: FUND_NAME}
}

export function parseVirtusSummary(summaryHtml: string, now = new Date()) {
  const {document} = parseHTML(summaryHtml)
  if (document.querySelector('.ticker-container .symbol')?.textContent.trim() !== 'UTES') throw new Error('Virtus summary ticker mismatch')
  const assets = document.querySelector('.net-assets')
  const amount = assets?.textContent.trim().replaceAll(',', '') ?? ''
  const summaryDate = assets?.closest('.fund-fact')?.querySelector('.asof')?.textContent.match(/as of\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1]
  if (!summaryDate) throw new Error('Virtus net assets date is missing')
  const expenseRow = [...document.querySelectorAll('tr')].find(row => row.querySelector('td')?.textContent.trim() === 'Total Expense Ratio')
  const expense = expenseRow?.querySelectorAll('td')[1]?.textContent.trim().replace(/%$/, '') ?? ''
  const objective = document.querySelector('.product-overview-container p')?.textContent.trim() || null
  const active = [...document.querySelectorAll('p')].find(p => /actively managed exchange-traded fund/.test(p.textContent))?.textContent.trim() ?? ''
  return {
    summaryAsOf: issuerDate(summaryDate, now),
    assetsUnderManagement: /^\d+(?:\.\d+)?$/.test(amount) ? Number(amount) : null,
    expenseRatio: /^\d+(?:\.\d+)?$/.test(expense) ? Number(expense) / 100 : null,
    benchmark: document.querySelector('.index-name')?.textContent.trim() || null,
    strategy: objective ? [objective, active].filter(Boolean).join(' ') : null,
    rebalanceFrequency: null,
  }
}

/** Virtus accepts native HTTPS but returns 406 to Node's Fetch transport.
 * Keep the issuer-specific transport bounded and read-only; do not execute curl
 * or carry cookies, credentials, or redirects between origins. */
const fetchVirtusIssuer: typeof fetch = async (input, init) => new Promise((resolve, reject) => {
  const url = input instanceof Request ? input.url : String(input)
  const request = httpsGet(url, {headers: Object.fromEntries(new Headers(init?.headers)), signal: init?.signal ?? undefined}, response => {
    const headers = new Headers()
    for (const [name, values] of Object.entries(response.headers)) {
      if (values !== undefined) headers.set(name, Array.isArray(values) ? values.join(', ') : values)
    }
    if (response.statusCode !== 200) {
      response.resume()
      resolve(new Response(null, {status: response.statusCode ?? 502, headers}))
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    response.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 2 * 1024 * 1024) { response.destroy(new Error('Virtus issuer response exceeds the size limit')); return }
      chunks.push(chunk)
    })
    response.on('end', () => resolve(new Response(Buffer.concat(chunks), {status: 200, headers})))
    response.on('error', reject)
  })
  request.on('error', reject)
})

export async function fetchVirtusFund(summaryUrl: string, symbol: string, now = new Date(), fetchImpl = fetchVirtusIssuer) {
  if (symbol !== 'UTES' || summaryUrl !== VIRTUS_UTES_SUMMARY_URL) throw new Error('Unsupported Virtus fund')
  const request = async (url: string) => {
    const parsed = new URL(url)
    if (parsed.origin !== ORIGIN || parsed.username || parsed.password) throw new Error('Unexpected Virtus issuer origin')
    const response = await fetchImpl(url, {redirect: 'error', signal: AbortSignal.timeout(20_000), headers: {'User-Agent': 'Stratum/0.5 (+private ETF research worker)', Accept: 'text/html,application/vnd.ms-excel,*/*;q=0.8'}})
    if (!response.ok) throw new Error(`Virtus issuer request failed (${response.status})`)
    return response
  }
  const summaryHtml = await (await request(summaryUrl)).text()
  const summary = parseVirtusSummary(summaryHtml, now)
  const {document} = parseHTML(summaryHtml)
  const links = [...document.querySelectorAll('a[href]')].filter(a => a.getAttribute('data-eventLabel')?.startsWith('Positions UTES - '))
  if (links.length !== 1) throw new Error('Virtus complete UTES positions workbook link is missing or ambiguous')
  const holdingsUrl = new URL(links[0]!.getAttribute('href')!, ORIGIN).href
  if (!new URL(holdingsUrl).pathname.match(/^\/assets\/files\/[a-z0-9]+\/positions_utes\.xls$/i)) throw new Error('Unexpected Virtus positions workbook path')
  const response = await request(holdingsUrl)
  const length = Number(response.headers.get('content-length'))
  if (length > 2 * 1024 * 1024) throw new Error('Virtus holdings workbook exceeds the size limit')
  const data = parseVirtusHoldings(new Uint8Array(await response.arrayBuffer()), now)
  return {...data, ...summary, summaryHtml, holdingsUrl}
}
