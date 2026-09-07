import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchVanEckFund, parseVanEckHoldings } from '../lib/server/vaneck-holdings.ts'

const now = new Date('2026-09-07T14:00:00Z')
const data = () => ({data: {Ticker: 'NLR', IsTopTen: false, TotalAmount: '5', AsOfDate: '09/03/2026', Holdings: [
  ...Array.from({length: 5}, (_,i) => ({Ticker: 'NLR', Label: i === 0 ? 'FORTUM FH' : `TEST${i}`, HoldingName: `Company ${i}`, ISIN: `ID${i}`, Weight: '20.02', Shares: '10', MV: '1,000', Sector: 'Utilities', AsOfDate: '09/03/26'})),
  {Ticker: 'NLR', Label: '--', HoldingName: 'Other/Cash', Weight: '-0.1', AsOfDate: '09/03/26'},
]}})
test('complete issuer holdings preserve foreign identities, negative cash and real dates', () => {
  const result = parseVanEckHoldings(data(), 'NLR', now)
  assert.equal(result.holdings.length, 6)
  assert.equal(result.dataAsOf, '2026-09-03T00:00:00.000Z')
  assert.equal(result.holdings[0].symbol, null)
  assert.equal(result.holdings[0].identifier, 'ID0')
  assert.equal(result.holdings[5].weight, -0.001)
  assert.ok(Math.abs(result.holdings.reduce((s,h) => s+h.weight,0)-1)<1e-10)
})
test('reject wrong funds, top-ten lists, partial weights, duplicates and mixed/future dates', () => {
  const mutations = [
    (d: ReturnType<typeof data>) => {d.data.Ticker='RACK'},
    (d: ReturnType<typeof data>) => {d.data.IsTopTen=true},
    (d: ReturnType<typeof data>) => {d.data.TotalAmount='50'},
    (d: ReturnType<typeof data>) => {d.data.Holdings[0].Weight='1'},
    (d: ReturnType<typeof data>) => {d.data.Holdings.push(d.data.Holdings[0])},
    (d: ReturnType<typeof data>) => {d.data.Holdings[0].AsOfDate='09/02/26'},
    (d: ReturnType<typeof data>) => {d.data.AsOfDate='09/30/2026'},
    (d: ReturnType<typeof data>) => {d.data.AsOfDate='02/30/2026'},
  ]
  for (const mutate of mutations) {const d=data();mutate(d);assert.throws(()=>parseVanEckHoldings(d,'NLR',now))}
})
test('blank issuer identifier fields fall back to distinct labels instead of merging cash or stocks', () => {
  const d = data()
  Object.assign(d.data.Holdings[0], {ISIN: '', FIGI: ' ', Label: 'ABC'})
  Object.assign(d.data.Holdings[1], {ISIN: ' ', FIGI: ' ', Label: 'DEF'})
  const result = parseVanEckHoldings(d, 'NLR', now)
  assert.equal(result.holdings[0].identifier, 'ABC')
  assert.equal(result.holdings[1].identifier, 'DEF')
})
test('public cookie redirects are bounded to issuer origin and component IDs come from the page', async () => {
  let calls=0
  const fetchImpl: typeof fetch = async (input,init) => {
    const url=new URL(String(input));assert.equal(url.origin,'https://www.vaneck.com');calls++
    if(calls===1)return new Response(null,{status:302,headers:{location:'?cken=true','set-cookie':'publicSession=ok; Path=/; Secure'}})
    assert.equal(new Headers(init?.headers).get('cookie'),'publicSession=ok')
    if(calls===2)return new Response('  <!DOCTYPE html><html><head><title>NLR - Test fund | VanEck</title></head><body><ve-fundticker>NLR</ve-fundticker><ve-holdingsblock data-blockid="123" data-pageid="456"></ve-holdingsblock></body></html>')
    assert.equal(url.pathname,'/Main/HoldingsBlock/GetContent/')
    assert.equal(url.searchParams.get('blockid'),'123')
    assert.equal(url.searchParams.get('pageid'),'456')
    return Response.json(data())
  }
  const result=await fetchVanEckFund('https://www.vaneck.com/us/test/','NLR',now,fetchImpl)
  assert.equal(result.holdings.length,6)
  assert.equal(result.fundName,'Test fund')
  await assert.rejects(fetchVanEckFund('https://www.vaneck.com/us/test/','NLR',now,async()=>new Response(null,{status:302,headers:{location:'https://unrelated.example/'}})),/redirect origin/)
  await assert.rejects(fetchVanEckFund('https://www.vaneck.com/us/test/','NLR',now,async()=>new Response(null,{status:429})),/429/)
})
