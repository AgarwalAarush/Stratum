import test from 'node:test'
import assert from 'node:assert/strict'
import { buildResearchCoveragePlan, INTEREST_WATCHLISTS, type CoverageState } from '../lib/markets/research-coverage-scheduling.ts'
import { currentResearchContract } from './fixtures/current-research-contract.ts'
import { CURRENT_RESEARCH_CONTRACT_VERSION } from '../lib/markets/research-contract.ts'

const ownerId = 'owner-a'
const report = currentResearchContract('filing')
const candidate = (symbol: string) => ({ symbol, status: 'new', generatedAt: '2026-07-01T00:00:00Z' })

test('deliberate interests reach company research without a Scout trigger or a price move', () => {
  const available = new Set(INTEREST_WATCHLISTS.flatMap(list => [...list.symbols]))
  const plan = buildResearchCoveragePlan({ ownerId, ownedSymbols: [], candidates: [], research: [], states: [], availableSymbols: available,
    watchlists: INTEREST_WATCHLISTS.map(list => ({ ownerId, name: list.name, symbols: list.symbols })),
    now: new Date('2026-10-01'), directResearchSymbols: ['LITE'] })
  assert.equal(plan.records.length, available.size)
  assert.equal(plan.selected.length, 2)
  assert.equal(plan.selected[0].symbol, 'LITE')
  assert.ok(plan.selected.every(record => record.lane === 'interest'))
  assert.ok(plan.selected.every(record => record.overdue && record.lastMeaningfulReviewAt === null))
})

test('reserved slots advance all three lanes despite failed attempts and recurring market movers', () => {
  const interests = Array.from({ length: 10 }, (_, index) => `INT${index}`)
  const holdings = Array.from({ length: 5 }, (_, index) => `OWN${index}`)
  const leads = Array.from({ length: 5 }, (_, index) => `OLD${index}`)
  const availableSymbols = new Set([...interests, ...holdings, ...leads])
  const seen = new Set<string>(), states = new Map<string, CoverageState>()
  for (let day = 1; day <= 5; day++) {
    const now = new Date(`2026-10-0${day}T10:00:00Z`)
    const plan = buildResearchCoveragePlan({ ownerId, ownedSymbols: holdings,
      watchlists: [{ ownerId, name: 'Photonics', symbols: interests }],
      candidates: leads.map(candidate), research: [], states: [...states.values()], availableSymbols, now })
    assert.equal(plan.selected.filter(record => record.lane === 'interest').length, 2)
    assert.equal(plan.selected.filter(record => record.lane === 'rotation').length, 1)
    assert.equal(plan.selected.filter(record => record.lane === 'owned').length, 1)
    for (const selected of plan.selected) {
      // A failed report is still an attempt; its turn must not erase everyone
      // else's research opportunity, nor count as meaningful completed review.
      assert.equal(seen.has(selected.symbol), false)
      seen.add(selected.symbol)
      states.set(selected.symbol, { ...selected, lastSelectedAt: now.toISOString() })
    }
    const sameDay = buildResearchCoveragePlan({ ownerId, ownedSymbols: holdings,
      watchlists: [{ ownerId, name: 'Photonics', symbols: interests }], candidates: leads.map(candidate),
      research: [], states: [...states.values()], availableSymbols, now })
    assert.equal(sameDay.selected.length, 0)
    assert.ok(sameDay.records.every(record => record.lastMeaningfulReviewAt === null && record.overdue))
  }
  assert.equal(seen.size, availableSymbols.size)
})

test('a single available daily slot rotates categories instead of starving holdings or discovery', () => {
  const seenLanes = new Map<string, number>()
  const states: CoverageState[] = []
  for (let day = 1; day <= 8; day++) {
    const now = new Date(`2026-10-0${day}T10:00:00Z`)
    const plan = buildResearchCoveragePlan({ ownerId, ownedSymbols: ['OWN'], watchlists: [{ ownerId, name: 'Space', symbols: ['INTA', 'INTB'] }],
      candidates: [candidate('ROT')], research: [], states, availableSymbols: new Set(['OWN', 'INTA', 'INTB', 'ROT']), maxTargets: 1, now })
    assert.equal(plan.selected.length, 1)
    const selected = plan.selected[0]
    seenLanes.set(selected.lane, (seenLanes.get(selected.lane) ?? 0) + 1)
    const previous = states.findIndex(state => state.symbol === selected.symbol)
    if (previous !== -1) states.splice(previous, 1)
    states.push({ ...selected, lastSelectedAt: now.toISOString() })
  }
  assert.deepEqual(Object.fromEntries(seenLanes), { rotation: 2, interest: 4, owned: 2 })
})

test('only owner-specific complete current-contract research resets meaningful coverage', () => {
  const now = new Date('2026-10-01')
  const research = [
    { ownerId: 'owner-b', symbol: 'AAA', status: 'complete', generatedAt: '2026-09-30', content: report },
    { ownerId, symbol: 'BBB', status: 'complete', generatedAt: '2026-09-30', content: { researchContractVersion: 0 } },
    { ownerId, symbol: 'CCC', status: 'running', generatedAt: '2026-09-30', content: report },
    { ownerId, symbol: 'DDD', status: 'complete', generatedAt: '2026-11-30', content: report },
    { ownerId, symbol: 'EEE', status: 'complete', generatedAt: '2026-09-30', content: report },
  ]
  const plan = buildResearchCoveragePlan({ ownerId, ownedSymbols: [], watchlists: [{ ownerId, name: 'AI', symbols: research.map(note => note.symbol) }, { ownerId: 'owner-b', name: 'Private', symbols: ['PRIVATE'] }],
    candidates: [{ ...candidate('HIDDEN'), ownerId: 'owner-b' }], research, states: [{ ownerId: 'owner-b', symbol: 'AAA', enrolledAt: '2026-09-01', lastSelectedAt: '2026-10-01', selectionReason: 'Other owner' }],
    availableSymbols: new Set([...research.map(note => note.symbol), 'PRIVATE', 'HIDDEN']), now })
  assert.equal(plan.records.length, 5)
  assert.equal(plan.records.find(record => record.symbol === 'AAA')?.lastSelectedAt, null)
  assert.ok(plan.records.filter(record => record.symbol !== 'EEE').every(record => record.overdue && record.lastMeaningfulReviewAt === null))
  assert.equal(plan.records.find(record => record.symbol === 'EEE')?.nextReviewDueAt, '2026-11-04T00:00:00.000Z')
  assert.equal(plan.records.find(record => record.symbol === 'EEE')?.overdue, false)
})

test('missing catalog identity and active work remain visible without unsafe queue admission', () => {
  const plan = buildResearchCoveragePlan({ ownerId, ownedSymbols: ['UNKNOWN', 'ACTIVE', 'PENDING'], watchlists: [], candidates: [], research: [], states: [],
    availableSymbols: new Set(['ACTIVE', 'PENDING']), researchEligibleSymbols: new Set(['ACTIVE']), activeSymbols: new Set(['ACTIVE']), now: new Date('2026-10-01') })
  assert.equal(plan.selected.length, 0)
  assert.deepEqual(plan.unavailableSymbols, ['PENDING', 'UNKNOWN'])
  assert.equal(plan.records.find(record => record.symbol === 'ACTIVE')?.active, true)
  assert.equal(plan.records.find(record => record.symbol === 'PENDING')?.overdue, true)
})

test('a permanently failing first report cannot starve an overdue previously reviewed holding', () => {
  const now = new Date('2026-10-01')
  const plan = buildResearchCoveragePlan({ ownerId, ownedSymbols: ['AAA', 'BBB'], watchlists: [], candidates: [],
    research: [{ ownerId, symbol: 'BBB', status: 'complete', generatedAt: '2026-09-01', content: report }],
    states: [{ ownerId, symbol: 'AAA', enrolledAt: '2026-08-01', lastSelectedAt: '2026-09-30', selectionReason: 'Failed attempt' }],
    availableSymbols: new Set(['AAA', 'BBB']), now })
  assert.deepEqual(plan.selected.map(record => record.symbol), ['BBB'])
  assert.equal(plan.records.find(record => record.symbol === 'AAA')?.lastMeaningfulReviewAt, null)
  assert.equal(plan.records.find(record => record.symbol === 'AAA')?.overdue, true)
})

test('a cited supported contract revalidation resets review age without falsely claiming a new report', () => {
  const base = {
    ownerId, ownedSymbols: ['AAA'], watchlists: [], candidates: [], states: [], availableSymbols: new Set(['AAA']), now: new Date('2026-10-01'),
    research: [{ id: 'report-a', ownerId, symbol: 'AAA', status: 'complete', generatedAt: '2026-08-01', content: report }],
  }
  const check = { ownerId, symbol: 'AAA', researchNoteId: 'report-a', classification: 'revalidate', createdAt: '2026-09-30', content: { readiness: 'complete', update: { conclusion: 'supported', researchContractVersion: CURRENT_RESEARCH_CONTRACT_VERSION, sourceIds: ['current-filing'] } } }
  const reviewed = buildResearchCoveragePlan({ ...base, revalidations: [check] })
  assert.equal(reviewed.selected.length, 0)
  assert.equal(reviewed.records[0].lastMeaningfulReviewAt, '2026-09-30')
  assert.equal(reviewed.records[0].nextReviewDueAt, '2026-10-14T00:00:00.000Z')
  for (const invalid of [
    { ...check, classification: 'reprice' },
    { ...check, researchNoteId: 'other-report' },
    { ...check, ownerId: 'other-owner' },
    { ...check, createdAt: '2026-11-01' },
    { ...check, content: { readiness: 'complete', update: { ...check.content.update, conclusion: 'insufficient' } } },
    { ...check, content: { readiness: 'complete', update: { ...check.content.update, sourceIds: [] } } },
    { ...check, content: { readiness: 'complete', update: { ...check.content.update, researchContractVersion: 0 } } },
  ]) {
    const plan = buildResearchCoveragePlan({ ...base, revalidations: [invalid] })
    assert.equal(plan.records[0].lastMeaningfulReviewAt, '2026-08-01')
    assert.equal(plan.records[0].overdue, true)
  }
})

test('stale Scout leads remain eligible but later dismissals, snoozes and future observations are excluded', () => {
  const plan = buildResearchCoveragePlan({ ownerId, ownedSymbols: [], watchlists: [], research: [], states: [], now: new Date('2026-10-01'),
    candidates: [candidate('STALE'), candidate('DISMISSED'), { ...candidate('DISMISSED'), status: 'dismissed', generatedAt: '2026-08-01' },
      { ...candidate('SNOOZED'), snoozedUntil: '2026-11-01' }, { ...candidate('FUTURE'), generatedAt: '2026-11-01' }],
    availableSymbols: new Set(['STALE', 'DISMISSED', 'SNOOZED', 'FUTURE']) })
  assert.deepEqual(plan.records.map(record => record.symbol), ['STALE'])
  assert.equal(plan.selected[0].symbol, 'STALE')
  assert.match(plan.selected[0].selectionReason ?? '', /Reserved discovery rotation/)
})
