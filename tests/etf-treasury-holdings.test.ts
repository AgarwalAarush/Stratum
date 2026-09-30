import test from 'node:test'
import assert from 'node:assert/strict'
import {ETF_SOURCES,parseIsharesTreasury,etfEvidenceQuality} from '../lib/server/etf-research.ts'

const csv = `iShares 0-3 Month Treasury Bond ETF
Fund Holdings as of,"Sep 28, 2026"
Name,Sector,Asset Class,Market Value,Weight (%),Par Value,CUSIP
"TREASURY BILL","Cash and/or Derivatives","Cash","1,000.00",25,"1,005.00",912797A
"TREASURY BILL","Cash and/or Derivatives","Cash",1000,25,1005,912797B
"TREASURY BILL","Cash and/or Derivatives","Cash",1000,25,1005,912797C
"TREASURY BILL","Cash and/or Derivatives","Cash",1000,25,1005,912797D
"TREASURY BILL","Cash and/or Derivatives","Cash",500,12,505,912797E
"USD CASH","Cash and/or Derivatives","Cash",-500,-12,-500,-
Issuer explanatory footnote`
const now=new Date('2026-09-30T08:00:00Z')
test('Treasury issuer snapshot retains distinct bills and negative cash without inflating total exposure',()=>{
  const p=parseIsharesTreasury('',csv,now)
  assert.equal(p.holdings.length,6)
  assert.equal(p.holdings.filter(h=>h.name==='TREASURY BILL').length,5)
  assert.equal(p.holdings.at(-1)!.weight,-.12)
  assert.equal(p.holdings.at(-1)!.marketValue,-500)
  assert.equal(p.holdings[0]!.marketValue,1000)
  assert.equal(p.dataAsOf,'2026-09-28T00:00:00.000Z')
  assert.deepEqual(etfEvidenceQuality(p,now.toISOString(),now).missing,[])
  assert.equal(p.expenseRatio,null)
})
test('missing and future issuer dates, absent columns and malformed weights cannot become usable evidence',()=>{
  for(const input of [csv.replace('Sep 28, 2026','Jan 1, 2027'),csv.replace('Fund Holdings as of','Date unavailable'),csv.replace('Weight (%)','Wrong header'),csv.replace(',25,',',invalid,')])
    assert.throws(()=>parseIsharesTreasury('',input,now))
  const p=parseIsharesTreasury('',csv.replace(',25,',',2,'),now)
  assert.ok(etfEvidenceQuality(p,now.toISOString(),now).missing.includes('Complete issuer holdings coverage'))
})
test('registered SHLD uses the existing Global X issuer parser and SGOV uses its dated Treasury CSV',()=>{
  assert.equal(ETF_SOURCES.SHLD.issuer,'Global X')
  assert.equal(ETF_SOURCES.SGOV.parse,parseIsharesTreasury)
})
