import test from 'node:test'
import assert from 'node:assert/strict'
import { checkpointDate, agingEndpoint, agingSemantics } from '../lib/markets/recommendation-aging.ts'
import { validateResearchAdvice } from '../lib/markets/research-advice.ts'
test('calendar anniversaries clamp month ends and leap years using issuance in New York', () => {
  assert.equal(checkpointDate('2024-01-31T21:00:00Z','1m'),'2024-02-29')
  assert.equal(checkpointDate('2024-02-29T21:00:00Z','1y'),'2025-02-28')
  assert.equal(checkpointDate('2025-01-31T21:00:00Z','2m'),'2025-03-31')
  assert.equal(checkpointDate('2026-10-01T02:00:00Z','1w'),'2026-10-07')
})
test('aging uses the last completed eligible session with early-close feed delay', () => {
  const sessions = [{date:'2026-11-25',open:'09:30',close:'16:00'},{date:'2026-11-27',open:'09:30',close:'13:00'}]
  assert.equal(agingEndpoint(sessions,'2026-11-28',new Date('2026-11-27T18:14:59Z')),'2026-11-25')
  assert.equal(agingEndpoint(sessions,'2026-11-28',new Date('2026-11-27T18:15:00Z')),'2026-11-27')
  assert.equal(agingEndpoint(sessions,'2026-11-26',new Date('2026-12-01T00:00:00Z')),'2026-11-25')
  assert.equal(agingSemantics('research'),'descriptive')
  assert.equal(agingSemantics('sell'),'hypothetical_reduction')
  assert.equal(agingSemantics('hold'),'hypothetical_exposure')
})
test('cited advice distinguishes cautious entry from affirmative retention and rejects contradictions', () => {
  const field = (value: string) => ({value,reason:'Supported by cited primary evidence.',sourceIds:['source'],changeConditions:['A decisive new disclosure changes the premise.']})
  const advice = {version:1,businessView:field('constructive'),evidenceSufficiency:field('sufficient'),newEntryStance:field('wait'),existingPositionStance:field('retain')}
  assert.equal(validateResearchAdvice(advice,['source']).existingPositionStance.value,'retain')
  assert.throws(()=>validateResearchAdvice({...advice,existingPositionStance:{...field('retain'),reason:'Zero ownership; exit all shares.'}},['source']),/zero exposure/)
  assert.throws(()=>validateResearchAdvice({...advice,evidenceSufficiency:field('insufficient')},['source']),/Insufficient/)
  assert.throws(()=>validateResearchAdvice(advice,['other']),/Invalid cited/)
})
