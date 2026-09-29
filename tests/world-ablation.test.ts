import test from 'node:test'
import assert from 'node:assert/strict'
import type { DecisionContext, Recommendation } from '../lib/markets/recommendations.ts'
import { selectAblationQuestions, validateAblationAnswers, withoutWorldContext } from '../lib/markets/world-ablation.ts'

test('ablation removes explicit World context while preserving identical company evidence and original inputs', () => {
  const context = { world: [{ id: 'w' }], evidence: [{ id: 'w', kind: 'causal_model' }, { id: 'p', kind: 'company_packet', value: { revenue: 100 } }], names: [{ symbol: 'ABC', sources: ['w', 'p'], causalLinks: ['w'], research: { thesis: 'company evidence' } }] } as unknown as DecisionContext
  const before = JSON.stringify(context)
  const arm = withoutWorldContext(context)
  assert.deepEqual(arm.world, [])
  assert.deepEqual(arm.names[0].causalLinks, [])
  assert.deepEqual(arm.names[0].sources, ['p'])
  assert.deepEqual(arm.evidence, [context.evidence[1]])
  assert.deepEqual(arm.names[0].research, context.names[0].research)
  assert.equal(JSON.stringify(context), before)
})

test('question selection is predeclared, bounded and never exposes original probabilities', () => {
  const recs = Array.from({ length: 8 }, (_, i) => ({ symbol: `S${i}`, portfolioId: 'one', gateReasons: [], forecasts: [{ metric: 'FMP:incomeQuarterly:revenue', observationPeriod: '2026-09-30', unit: 'USD', deadline: '2026-10-30', probability: 0.9 }] })) as unknown as Recommendation[]
  const questions = selectAblationQuestions([...recs, { ...recs[0], portfolioId: 'two' }], '2026-09-29')
  assert.equal(questions.length, 6)
  assert.equal(new Set(questions.map(q => q.symbol)).size, 6)
  assert.ok(questions.every(q => !('probability' in q)))
  assert.deepEqual(selectAblationQuestions([{ ...recs[0], gateReasons: ['evidence failed'] }], '2026-09-29'), [])
  assert.deepEqual(selectAblationQuestions(recs, '2027-01-01'), [])
})

test('ablation arms must answer exactly the same questions with their own allowed evidence', () => {
  const answer = { key: 'one', probability: 0.7, reason: 'Dated evidence', sourceIds: ['p'] }
  assert.equal(validateAblationAnswers({ answers: [answer] }, ['one'], new Set(['p'])).length, 1)
  assert.throws(() => validateAblationAnswers({ answers: [answer] }, ['one'], new Set()), /Unsubstantiated/)
  assert.throws(() => validateAblationAnswers({ answers: [answer, answer] }, ['one', 'two'], new Set(['p'])), /duplicate/)
  assert.throws(() => validateAblationAnswers({ answers: [{ ...answer, probability: 1.5 }] }, ['one'], new Set(['p'])), /probability/)
})
