import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { fetchVirtusFund, parseVirtusHoldings, parseVirtusSummary, VIRTUS_UTES_SUMMARY_URL } from '../lib/server/virtus-holdings.ts'
import { ETF_SOURCES, etfEvidenceQuality, isEtfInstrument } from '../lib/server/etf-research.ts'

const now = new Date('2026-10-03T18:00:00Z')
const bytes = readFileSync(new URL('./fixtures/virtus/positions-utes-2026-10-02.xls', import.meta.url))
const summary = readFileSync(new URL('./fixtures/virtus/utes-summary-2026-10-03.html', import.meta.url), 'utf8')
const holdingsUrl = 'https://www.virtus.com/assets/files/1n6/positions_utes.xls'
function changed(mutate: (sheet: XLSX.WorkSheet, workbook: XLSX.WorkBook) => void) {
  const workbook = XLSX.read(bytes, {type: 'buffer'})
  mutate(workbook.Sheets[workbook.SheetNames[0]!]!, workbook)
  return XLSX.write(workbook, {type: 'buffer', bookType: 'biff8'}) as Buffer
}

test('actual official UTES positions XLS includes every stock and cash with the issuer date', () => {
  const packet = parseVirtusHoldings(bytes, now)
  assert.equal(packet.fundName, 'Virtus Reaves Utilities ETF')
  assert.equal(packet.dataAsOf, '2026-10-02T00:00:00.000Z')
  assert.equal(packet.holdingsCount, 19)
  assert.equal(packet.holdings.length, 19)
  assert.deepEqual(packet.holdings[0], {
    identifier: 'EQ0000000090417573', name: 'Constellation Energy Corp', symbol: 'CEG', classification: 'Common Stock',
    shares: 530606, marketValue: 137384505.52, weight: 12.05 / 100,
  })
  assert.deepEqual(packet.holdings.at(-1), {
    identifier: 'USD', name: 'Cash/Cash equivalents', symbol: null, classification: 'Cash',
    shares: 1168117.53, marketValue: 1168117.53, weight: .001,
  })
  assert.ok(Math.abs(packet.holdings.reduce((sum, h) => sum + h.weight, 0) - 1.0002) < 1e-10)
  assert.deepEqual(etfEvidenceQuality(packet, '2026-10-02T20:00:00Z', now).missing, [])
})

test('issuer metadata keeps the dated net assets and active strategy separate from a passive replication mandate', () => {
  const metadata = parseVirtusSummary(summary, now)
  assert.equal(metadata.expenseRatio, .0049)
  assert.equal(metadata.assetsUnderManagement, 1143956756)
  assert.equal(metadata.summaryAsOf, '2026-10-01T00:00:00.000Z')
  assert.equal(metadata.benchmark, 'S&P 500® Utilities Index')
  assert.match(metadata.strategy!, /capital appreciation and income/)
  assert.match(metadata.strategy!, /does not seek to replicate/)
  assert.equal(metadata.rebalanceFrequency, null)
  assert.throws(() => parseVirtusSummary(summary.replace('>UTES<', '>XLU<'), now), /ticker mismatch/)
  assert.throws(() => parseVirtusSummary(summary.replace('10/01/2026', '10/04/2026'), now), /future-dated/)
  assert.throws(() => parseVirtusSummary(summary.replace('(as of 10/01/2026)', ''), now), /date is missing/)
})

test('missing, impossible or future holdings dates cannot become a current packet', () => {
  for (const value of ['Positions unavailable', 'Positions as of 2/30/2026', 'Positions as of 10/04/2026']) {
    assert.throws(() => parseVirtusHoldings(changed(sheet => { sheet.A1 = {t: 's', v: value} }), now), /date/)
  }
  const old = parseVirtusHoldings(changed(sheet => { sheet.A1 = {t: 's', v: 'Positions as of 9/01/2026'} }), now)
  assert.ok(etfEvidenceQuality(old, now.toISOString(), now).missing.includes('Current issuer holdings date'))
})

test('wrong funds, partial lists, duplicate identities, broken trailing rows and invalid values are rejected', () => {
  const mutations: Array<(sheet: XLSX.WorkSheet, workbook: XLSX.WorkBook) => void> = [
    sheet => { sheet.A4 = {t: 's', v: 'Different Utilities ETF'} },
    sheet => { sheet['!ref'] = 'A1:P13'; for (let row = 14; row <= 22; row++) for (let column = 0; column < 16; column++) delete sheet[XLSX.utils.encode_cell({r: row - 1, c: column})] },
    sheet => { sheet.B5 = {...sheet.B4} },
    sheet => { delete sheet.B22 },
    sheet => { sheet.P4 = {t: 's', v: 'unknown%'} },
    sheet => { sheet.P4 = {t: 's', v: '1.00%'} },
    sheet => { delete sheet.F4 },
    sheet => { sheet.M3 = {t: 's', v: '(Local)'} },
    sheet => { sheet.P4 = {t: 'n', v: .1205, f: '12.05/100'} },
    (_sheet, workbook) => { XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Other fund']]), 'Other') },
  ]
  for (const mutate of mutations) assert.throws(() => parseVirtusHoldings(changed(mutate), now))
  assert.throws(() => parseVirtusHoldings(Buffer.from('<html>Issuer temporarily unavailable</html>'), now), /XLS/)
  assert.throws(() => parseVirtusHoldings(bytes.subarray(0, 512), now))
})

test('signed cash offsets are retained with their own identity and values', () => {
  const packet = parseVirtusHoldings(changed(sheet => {
    sheet.P22 = {t: 's', v: '-0.10%'}
    sheet.F22 = {t: 'n', v: -1168117.53}
    sheet.M22 = {t: 'n', v: -1168117.53}
  }), now)
  assert.equal(packet.holdings.at(-1)!.weight, -.001)
  assert.equal(packet.holdings.at(-1)!.marketValue, -1168117.53)
  assert.equal(packet.holdings.at(-1)!.identifier, 'USD')
})

test('fetch discovers the complete issuer workbook, preserving the two source dates', async () => {
  const calls: string[] = []
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push(String(url))
    assert.equal(init?.redirect, 'error')
    assert.ok(init?.signal)
    return String(url) === VIRTUS_UTES_SUMMARY_URL ? new Response(summary) : new Response(bytes)
  }
  const result = await fetchVirtusFund(VIRTUS_UTES_SUMMARY_URL, 'UTES', now, fetchImpl)
  assert.deepEqual(calls, [VIRTUS_UTES_SUMMARY_URL, holdingsUrl])
  assert.equal(result.holdings.length, 19)
  assert.equal(result.holdingsUrl, holdingsUrl)
  assert.equal(result.dataAsOf, '2026-10-02T00:00:00.000Z')
  assert.equal(result.summaryAsOf, '2026-10-01T00:00:00.000Z')
  assert.equal(ETF_SOURCES.UTES.issuer, 'Virtus')
  assert.equal(await isEtfInstrument('utes'), true)
})

test('issuer fetch rejects absent/ambiguous holdings links, foreign origins, failed requests and oversized workbooks', async () => {
  const htmls = [
    summary.replace('Positions UTES - ', 'Top Holdings - '),
    summary.replace('</body>', `${summary.match(/<a[\s\S]*?<\/a>/)![0]}</body>`),
    summary.replace(holdingsUrl, 'https://unrelated.example/assets/files/1n6/positions_utes.xls'),
  ]
  for (const html of htmls) {
    await assert.rejects(fetchVirtusFund(VIRTUS_UTES_SUMMARY_URL, 'UTES', now, async () => new Response(html)))
  }
  await assert.rejects(fetchVirtusFund(VIRTUS_UTES_SUMMARY_URL, 'UTES', now, async () => new Response(null, {status: 429})), /429/)
  await assert.rejects(fetchVirtusFund(VIRTUS_UTES_SUMMARY_URL, 'UTES', now, async url => String(url) === VIRTUS_UTES_SUMMARY_URL
    ? new Response(summary) : new Response(bytes, {headers: {'content-length': '3000000'}})), /size limit/)
  await assert.rejects(fetchVirtusFund(VIRTUS_UTES_SUMMARY_URL, 'XLU', now), /Unsupported/)
})
