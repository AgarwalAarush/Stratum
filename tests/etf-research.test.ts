import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { parseFirstTrust, parseGlobalX, validateEtfResearch } from '../lib/server/etf-research.ts'

const summary = `<main>First Trust NASDAQ Clean Edge Smart Grid Infrastructure Index Fund Investment Objective/Strategy - The Fund seeks investment results that correspond generally to the price and yield of its index. Tracking Index: Nasdaq Clean Edge Smart Grid Infrastructure Index Rebalance Frequency Quarterly Total Expense Ratio 0.56% Total Net Assets $11,421,155,243</main>`

const holdings = `<main>Holdings of the Fund as of Jul 21, 2026 Total Number of Holdings (excluding cash): 12 <table><tbody><tr><th>Security</th><th>Ticker</th><th>Classification</th><th>Shares</th><th>Market Value</th><th>Weighting</th></tr><tr><td>Eaton Corporation Plc</td><td>ETN</td><td>Diversified Industrials</td><td>2,462,350</td><td>$992,203,932.50</td><td>8.61%</td></tr><tr><td>Schneider Electric SE</td><td>SU.FP</td><td>Electrical Components</td><td>3,131,310</td><td>$959,657,315.63</td><td>8.32%</td></tr><tr><td>Johnson Controls International Plc</td><td>JCI</td><td>Electronic Equipment</td><td>6,732,174</td><td>$954,016,377.54</td><td>8.27%</td></tr><tr><td>ABB Ltd</td><td>ABBN.SW</td><td>Electrical Components</td><td>9,217,153</td><td>$917,348,593.52</td><td>7.96%</td></tr><tr><td>Quanta Services, Inc.</td><td>PWR</td><td>Engineering Services</td><td>1,385,950</td><td>$885,899,240.00</td><td>7.68%</td></tr></tbody></table></main>`

test('First Trust issuer adapter produces a deterministic holdings packet', () => {
  const packet = parseFirstTrust(summary, holdings)
  assert.equal(packet.issuer, 'First Trust')
  assert.equal(packet.expenseRatio, 0.0056)
  assert.equal(packet.assetsUnderManagement, 11_421_155_243)
  assert.equal(packet.rebalanceFrequency, 'Quarterly')
  assert.equal(packet.holdingsCount, 12)
  assert.equal(packet.holdings.length, 5)
  assert.equal(packet.holdings[0]?.name, 'Eaton Corporation Plc')
  assert.equal(packet.holdings[0]?.weight, 0.0861)
  assert.equal(packet.topTenWeight, 0.4084)
})

test('Global X adapter uses its official holdings CSV instead of performance tables', () => {
  const globalXSummary = '<main>Key Information As of Jul 31 2026 Total Expense Ratio?0.69% Net Assets $5.45 billion</main>'
  const globalXHoldings = `Global X Uranium ETF\nFund Holdings Data as of 07/31/2026\n% of Net Assets,Ticker,Name,SEDOL,Market Price ($),Shares Held,Market Value ($)\n8.01,CCO CN,CAMECO CORP,2166160,96.00,"45,124,508.00","4,331,952,768.00"\n7.15,KAP LI,NAC KAZATOMPROM JSC,6F5Q5M9,34.00,"47,050,911.00","2,840,495,094.00"\n6.27,SPUT LN,SPROTT PHYSICAL URANIUM TRUST,BMD7XQ5,32.00,"40,891,618.00","2,102,064,698.00"\n5.72,NXU CN,NEXGEN ENERGY LTD,BRJZZR2,7.00,"220,143,504.00","1,760,802,973.00"\n5.10,UUUU,ENERGY FUELS INC,BMCLYF9,10.00,"134,992,000.00","1,261,925,200.00"`
  const packet = parseGlobalX(globalXSummary, globalXHoldings)
  assert.equal(packet.expenseRatio, 0.0069)
  assert.equal(packet.assetsUnderManagement, 5_450_000_000)
  assert.equal(packet.holdingsCount, 5)
  assert.equal(packet.holdings[0]?.name, 'CAMECO CORP')
  assert.equal(packet.topTenWeight, 0.3225)
})

test('ETF research validation requires the fund-specific schema and meaningful analysis', () => {
  const sectionIds = ['fund_snapshot', 'portfolio_exposure', 'top_holdings', 'index_and_rebalance', 'fundamentals_look_through', 'valuation_and_setup', 'catalysts', 'bull_case', 'base_case', 'bear_case', 'risk_factors', 'verdict']
  const content = Array.from({ length: 110 }, (_, index) => `evidence${index}`).join(' ')
  const validated = validateEtfResearch({
    formalRating: 'HOLD', entryAction: 'wait', investmentThesis: 'The fund offers focused exposure with a concentrated portfolio.',
    keyDebate: 'Whether the portfolio concentration is worth the thematic exposure.', fastestKillSignal: 'Issuer removes the core portfolio exposures.', confidence: 72,
    revision: { priorVersion: null, opinionChange: 'initial', summary: 'Issuer holdings are the initial evidence baseline.', changes: [{ field: 'evidence', previous: '', current: 'Initial issuer holdings snapshot', explanation: 'The first version is based on the current issuer export.' }] },
    sections: sectionIds.map((id) => ({ id, title: id, content, sourceIds: ['issuer-holdings'] })), sourceIds: ['issuer-summary', 'issuer-holdings'],
  })
  assert.equal(validated.sections.length, 12)
  assert.throws(() => validateEtfResearch({ ...validated, sections: validated.sections.slice(1) }), /12 required sections/)
})

test('ETF routing rejects corporate research and uses the dedicated job type', async () => {
  const [api, companyResearch, jobs, migration, report] = await Promise.all([
    readFile(new URL('../app/api/markets/research/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/company-research.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/agent-jobs.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608020001_etf_research.sql', import.meta.url), 'utf8'),
    readFile(new URL('../components/markets/EtfResearchReport.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(api, /generate-etf-research/)
  assert.match(companyResearch, /must use the ETF research pipeline/)
  assert.match(jobs, /generateEtfResearch/)
  assert.match(migration, /etf_research_packets/)
  assert.match(migration, /etf_research_notes/)
  assert.match(report, /What the fund owns/)
  assert.match(report, /Corporate financial statements and earnings are excluded/)
})
