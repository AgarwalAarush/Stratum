import { parseHTML } from 'linkedom'
import type { EtfHolding } from '../markets/types.ts'

const ORIGIN = 'https://www.vaneck.com'
const row = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const numeric = (value: unknown) => {
  const text = String(value ?? '').replaceAll(',', '').trim()
  return text && Number.isFinite(Number(text)) ? Number(text) : null
}
function issuerDate(value: unknown): string {
  const parts = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4}|\d{2})$/)
  if (!parts) throw new Error('VanEck holdings date is missing or invalid')
  const year = Number(parts[3]) + (parts[3].length === 2 ? 2000 : 0)
  const date = new Date(Date.UTC(year, Number(parts[1]) - 1, Number(parts[2])))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== Number(parts[1]) - 1 || date.getUTCDate() !== Number(parts[2])) throw new Error('Invalid VanEck calendar date')
  return date.toISOString()
}

export function parseVanEckHoldings(value: unknown, symbol: string, now = new Date()) {
  const data = row(row(value).data)
  if (data.Ticker !== symbol || data.IsTopTen !== false || !Array.isArray(data.Holdings)) throw new Error('VanEck response is not the complete requested fund holdings')
  const dataAsOf = issuerDate(data.AsOfDate)
  if (Date.parse(dataAsOf) > now.getTime()) throw new Error('VanEck holdings are future-dated')
  const holdingsCount = numeric(data.TotalAmount)
  if (!holdingsCount || !Number.isInteger(holdingsCount) || holdingsCount < 5 || data.Holdings.length < holdingsCount) throw new Error('VanEck holdings coverage is incomplete')
  const seen = new Set<string>()
  const holdings: EtfHolding[] = data.Holdings.map(raw => {
    const h = row(raw), label = String(h.Label ?? '').trim()
    const weight = numeric(h.Weight), key = [h.ISIN, h.FIGI, label].map(v => String(v ?? '').trim()).find(v => v && v !== '--') ?? label
    if (!key || seen.has(key) || weight === null || issuerDate(h.AsOfDate) !== dataAsOf || (h.Ticker && h.Ticker !== symbol)) throw new Error('Invalid, duplicate or mixed-date VanEck holding')
    seen.add(key)
    return {
      symbol: /^[A-Z][A-Z0-9.-]{0,11}$/.test(label) ? label : null,
      name: String(h.HoldingName ?? '').trim() || label, identifier: key,
      classification: String(h.Sector || h.AssetClass || '') || null,
      shares: numeric(h.Shares), marketValue: numeric(h.MV), weight: weight / 100,
    }
  })
  const coverage = holdings.reduce((sum, h) => sum + h.weight, 0)
  if (coverage < 0.95 || coverage > 1.02) throw new Error('VanEck holdings weights do not reconcile to a complete fund')
  return { holdings, holdingsCount, dataAsOf }
}

/** Public issuer session only. Cookies never leave this origin or persist. */
export async function fetchVanEckFund(summaryUrl: string, symbol: string, now = new Date(), fetchImpl = fetch) {
  const cookies = new Map<string, string>()
  const signal = AbortSignal.timeout(25_000)
  const request = async (initial: string) => {
    let url = new URL(initial, ORIGIN)
    for (let redirects = 0; redirects <= 6; redirects++) {
      if (url.origin !== ORIGIN) throw new Error('Unexpected VanEck redirect origin')
      const response = await fetchImpl(url, { redirect: 'manual', signal, headers: {
        'User-Agent': 'Stratum/0.4 (+issuer-holdings-research)',
        ...(cookies.size ? {Cookie: [...cookies.values()].join('; ')} : {}),
      } })
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';')[0]
        if (/^[A-Za-z0-9_-]+=[^\r\n]*$/.test(pair)) cookies.set(pair.split('=')[0], pair)
      }
      if ([301,302,303,307,308].includes(response.status)) {
        const location = response.headers.get('location')
        if (!location) throw new Error('VanEck redirect has no destination')
        url = new URL(location, url)
        continue
      }
      if (!response.ok) throw new Error(`VanEck issuer request failed (${response.status})`)
      return response
    }
    throw new Error('VanEck issuer redirect limit exceeded')
  }
  const summaryHtml = await (await request(summaryUrl)).text()
  const { document } = parseHTML(summaryHtml.trim())
  if (document.querySelector('ve-fundticker')?.textContent.trim() !== symbol) throw new Error('VanEck summary ticker mismatch')
  const block = document.querySelector('ve-holdingsblock')
  const blockId = block?.getAttribute('data-blockid'), pageId = block?.getAttribute('data-pageid')
  if (!/^\d+$/.test(blockId ?? '') || !/^\d+$/.test(pageId ?? '')) throw new Error('VanEck holdings component is missing')
  const holdingsUrl = `${ORIGIN}/Main/HoldingsBlock/GetContent/?blockid=${blockId}&pageid=${pageId}&ticker=${symbol}&reactlang=en&reactctr=us`
  const data = parseVanEckHoldings(await (await request(holdingsUrl)).json(), symbol, now)
  const stat = (label: string) => [...document.querySelectorAll('.fund-top-stats li')].find(li => li.querySelector('.item-title')?.textContent.trim().startsWith(label))
  const assets = stat('Total Net Assets')
  const amount = assets?.querySelector('.item-value')?.textContent.replace(/\s/g,'').match(/^\$([\d,.]+)([MBT])?$/)
  const aum = amount ? Number(amount[1].replaceAll(',','')) * ({M:1e6,B:1e9,T:1e12}[amount[2] as 'M'] ?? 1) : null
  const expense = stat('Total Expense Ratio')?.querySelector('.item-value')?.textContent.match(/([\d.]+)%/)
  const summaryDate = assets?.querySelector('.as-of-date')?.textContent.replace(/^as of\s+/i,'').trim()
  const summaryTime = summaryDate ? Date.parse(`${summaryDate} UTC`) : NaN
  return {
    ...data, summaryHtml, holdingsUrl,
    summaryAsOf: Number.isFinite(summaryTime) && summaryTime <= now.getTime() ? new Date(summaryTime).toISOString() : null,
    fundName: document.title.split(' | ')[0].replace(new RegExp(`^${symbol} - `), ''),
    strategy: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
    assetsUnderManagement: aum, expenseRatio: expense ? Number(expense[1]) / 100 : null,
  }
}
