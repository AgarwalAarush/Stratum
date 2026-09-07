import test from 'node:test'
import assert from 'node:assert/strict'
import {
  abstention,
  gateRecommendation,
  validateBatch,
  validateRecommendation,
  type DecisionContext,
  type DecisionName,
} from '../lib/markets/recommendations.ts'
import {
  evaluateMarkout,
  calibration,
  attributeDecision,
} from '../lib/markets/recommendation-evaluation.ts'
import { renderInvestmentNewsletter } from '../lib/markets/investment-newsletter.ts'
import { buildDueAgentJobs } from '../lib/server/agent-schedule.ts'
const name: DecisionName = {
  sector: 'Technology',
  averageDollarVolume: 1000000,
  symbol: 'ABC',
  securityId: 'security',
  portfolioId: 'portfolio',
  owned: false,
  quantity: 0,
  currentWeightPct: 0,
  portfolioValue: 10000,
  cash: 1000,
  quote: { price: 100, asOf: '2026-09-04T20:00:00Z', feed: 'iex' },
  research: { id: 'research' },
  thesis: { id: 'thesis', status: 'accepted' },
  sources: ['s'],
  gaps: [],
  causalLinks: [],
  selectionReason: 'watchlist',
}
const context: DecisionContext = {
  id: 'context',
  ownerId: 'owner',
  date: '2026-09-06',
  cutoff: '2026-09-06T14:00:00Z',
  policy: 'v1',
  codeVersion: 'sha',
  portfolio: [],
  names: [name],
  evidence: [
    {
      id: 's',
      kind: 'primary',
      url: 'https://example.com',
      asOf: '2026-09-04T20:00:00Z',
      availableAt: '2026-09-04T20:00:00Z',
      retrievedAt: '2026-09-06T14:00:00Z',
      hash: 'h',
      feed: null,
      value: {},
    },
  ],
  world: [],
  market: null,
  gaps: [],
  universe: [],
}
function recommendation() {
  return {
    ...abstention(name, context, 'Test abstention with enough context'),
    action: 'buy' as const,
    sourceIds: ['s'],
    entry: {
      condition: 'At or below the entry ceiling',
      maxPrice: 105,
      targetWeightPct: 5,
    },
    forecasts: [
      {
        proposition: 'Revenue exceeds the stated threshold',
        metric: 'revenue',
        operator: 'gt' as const,
        threshold: 100,
        probability: 0.7,
        deadline: '2027-01-01T00:00:00Z',
        confirmation: 'Audited revenue exceeds threshold',
        invalidation: 'Audited revenue misses threshold',
        sourceIds: ['s'],
      },
    ],
    gateReasons: [],
  }
}
test('new capital requires accepted thesis, freshness and available cash', () => {
  assert.equal(gateRecommendation(recommendation(), context).action, 'buy')
  for (const patch of [
    { cash: 0 },
    { thesis: { status: 'proposed' } },
    { gaps: ['Cash flow missing'] },
    { quote: null },
  ]) {
    const c = { ...context, names: [{ ...name, ...patch }] }
    const result = gateRecommendation(recommendation(), c)
    assert.equal(result.action, 'no_trade')
    assert.ok(result.gateReasons.length)
  }
})
test('unknown citations, future evidence and hidden missing holdings are rejected', () => {
  assert.throws(
    () =>
      validateRecommendation(
        { ...recommendation(), sourceIds: ['invented'] },
        context,
      ),
    /Unknown/,
  )
  assert.equal(
    gateRecommendation(recommendation(), {
      ...context,
      evidence: [
        { ...context.evidence[0], availableAt: '2027-01-01T00:00:00Z' },
      ],
    }).action,
    'no_trade',
  )
  assert.throws(() => validateBatch([], context), /cover every/)
  assert.throws(
    () =>
      validateBatch([recommendation(), recommendation()], {
        ...context,
        names: [name, { ...name, symbol: 'XYZ' }],
      }),
    /Duplicate/,
  )
})
test('combined sizing cannot spend the same portfolio cash twice', () => {
  const c = { ...context, names: [name, { ...name, symbol: 'XYZ' }] }
  const first = {
    ...recommendation(),
    entry: { ...recommendation().entry, targetWeightPct: 8 },
  }
  const result = validateBatch([first, { ...first, symbol: 'XYZ' }], c)
  assert.ok(result.every((r) => r.action === 'no_trade'))
})
test('invalidated holdings can be sold without accepting a new bullish thesis', () => {
  const c = {
    ...context,
    names: [
      {
        ...name,
        owned: true,
        quantity: 10,
        currentWeightPct: 10,
        thesis: { status: 'invalidated' },
      },
    ],
  }
  assert.equal(
    gateRecommendation(
      {
        ...recommendation(),
        action: 'sell',
        entry: {
          condition: 'Reduce invalidated exposure',
          maxPrice: null,
          targetWeightPct: 0,
        },
      },
      c,
    ).action,
    'sell',
  )
  assert.equal(
    gateRecommendation({ ...recommendation(), action: 'hold' }, context).action,
    'no_trade',
  )
})
test('exchange sessions exclude a holiday and never assume the pre-publication close', () => {
  const sessions = [
    '2026-09-04',
    '2026-09-08',
    '2026-09-09',
    '2026-09-10',
    '2026-09-11',
    '2026-09-14',
  ]
  const bars = sessions.map((date, i) => ({
    date,
    open: 100 + i,
    close: 101 + i,
    high: 102 + i,
    low: 99 + i,
  }))
  const result = evaluateMarkout({
    issuedDate: '2026-09-04',
    sessions,
    completedThrough: '2026-09-14',
    horizon: 5,
    bars,
    benchmark: bars,
    costBps: 20,
    maxEntryPrice: 100,
  })
  assert.equal(result.startDate, '2026-09-08')
  assert.equal(result.endDate, '2026-09-14')
  assert.equal(result.status, 'resolved')
  assert.equal(result.excessReturn, -0.002)
  assert.equal(result.conditionalEntry, 'unverifiable')
  assert.equal(
    evaluateMarkout({
      issuedDate: '2026-09-04',
      sessions,
      completedThrough: '2026-09-11',
      horizon: 5,
      bars,
      benchmark: bars,
      costBps: 20,
    }).status,
    'not_due',
  )
  assert.equal(
    evaluateMarkout({
      issuedDate: '2026-09-04',
      sessions,
      completedThrough: '2026-09-14',
      horizon: 5,
      bars: bars.filter((b) => b.date !== '2026-09-10'),
      benchmark: bars,
      costBps: 20,
    }).status,
    'needs_data',
  )
})
test('calibration excludes unresolved forecasts and clusters repeated episodes', () => {
  const result = calibration([
    { episodeId: 'a', probability: 0.8, outcome: true },
    { episodeId: 'a', probability: 0.9, outcome: true },
    { episodeId: 'b', probability: 0.6, outcome: null },
    { episodeId: 'c', probability: 0.2, outcome: false },
  ])
  assert.equal(result.independentEpisodes, 2)
  assert.equal(result.unresolved, 1)
  assert.ok(Math.abs(result.brier! - 0.04) < 1e-10)
  assert.equal(result.promotionEligible, false)
  assert.equal(
    attributeDecision({
      selectionReturn: 0.1,
      benchmarkReturn: 0.05,
      timedReturn: null,
      baselineWeight: 0.1,
      recommendedWeight: 0.2,
      riskManagedReturn: null,
      ownerReturn: null,
    }).timing,
    null,
  )
})
test('newsletter escapes source content and states missing current publication', () => {
  const email = renderInvestmentNewsletter({
    date: '2026-09-06',
    publishedAt: null,
    summary: '<script>bad</script>',
    recommendations: [],
    worldHighlights: [],
    outcomes: [],
    gaps: ['Store unavailable'],
  })
  assert.ok(!email.html.includes('<script>'))
  assert.match(email.text, /service-status edition/)
  assert.match(email.subject, /Weekend review/)
})
test('morning delivery tracks Pacific daylight saving and catches up after restart', () => {
  for (const date of [
    '2026-09-08T14:00:00Z',
    '2026-12-08T15:00:00Z',
    '2026-09-08T20:00:00Z',
  ])
    assert.ok(
      buildDueAgentJobs(new Date(date), { includeNewsletter: true }).some(
        (j) => j.jobType === 'send-investment-newsletter',
      ),
    )
  assert.ok(
    !buildDueAgentJobs(new Date('2026-09-08T13:59:00Z'), {
      includeNewsletter: true,
    }).some((j) => j.jobType === 'send-investment-newsletter'),
  )
})

test('signed delivery callbacks reject tampering and old replay attempts', async () => {
  const { verifyNewsletterWebhook } = await import(
    '../lib/server/newsletter-webhook.ts'
  )
  const { createHmac } = await import('node:crypto')
  const secret = 'whsec_' + Buffer.from('test-key').toString('base64'),
    body = '{"type":"email.delivered"}',
    timestamp = '1800000000',
    id = 'event'
  const signature = createHmac('sha256', 'test-key')
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64')
  const headers = new Headers({
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}`,
  })
  assert.equal(
    verifyNewsletterWebhook(body, headers, secret, Number(timestamp) * 1000),
    true,
  )
  assert.equal(
    verifyNewsletterWebhook(
      body + ' ',
      headers,
      secret,
      Number(timestamp) * 1000,
    ),
    false,
  )
  assert.equal(
    verifyNewsletterWebhook(
      body,
      headers,
      secret,
      Number(timestamp) * 1000 + 301000,
    ),
    false,
  )
})

test('learning requires prospective registration and cannot promote a small lucky cohort', async () => {
  const {
    validateLearningRegistration,
    learningPromotionGate,
    resolveNumericForecast,
  } = await import('../lib/markets/investment-learning.ts')
  const now = new Date('2026-09-01T00:00:00Z'),
    registration = {
      hypothesis: 'A stricter freshness gate improves forecast calibration.',
      baselinePolicy: 'v1',
      candidatePolicy: 'v2-shadow',
      startsAt: '2026-09-02T00:00:00Z',
      endsAt: '2026-12-01T00:00:00Z',
      primaryMetric: 'brier' as const,
      minimumEpisodes: 30,
      minimumImprovement: 0.01,
      maximumDrawdownWorsening: 0.02,
      embargoDays: 20,
      trialNumber: 2,
    }
  assert.equal(
    validateLearningRegistration(registration, now).candidatePolicy,
    'v2-shadow',
  )
  assert.throws(
    () =>
      validateLearningRegistration(
        { ...registration, startsAt: '2026-01-01' },
        now,
      ),
    /future/,
  )
  assert.equal(
    learningPromotionGate(registration, {
      independentEpisodes: 4,
      windowComplete: true,
      outOfSample: true,
      purgedOverlap: true,
      baseline: 0.3,
      candidate: 0.1,
      drawdownWorsening: 0,
      multipleTestingAdjusted: false,
      ownerReviewed: true,
      lowerImprovementBound: 0.02,
    }).eligible,
    false,
  )
  const f = {
    metric: 'revenue',
    threshold: 100,
    operator: 'gt' as const,
    issuedAt: '2026-09-01T00:00:00Z',
    deadline: '2026-12-31T00:00:00Z',
  }
  assert.equal(
    resolveNumericForecast(
      f,
      [
        {
          id: 'old',
          metric: 'revenue',
          value: 200,
          period: '2025-12-31',
          availableAt: '2026-10-01',
          sourceUrl: 'https://example.com',
        },
      ],
      '2027-01-01',
    ).outcome,
    null,
  )
  assert.equal(
    resolveNumericForecast(
      f,
      [
        {
          id: 'new',
          metric: 'revenue',
          value: 110,
          period: '2026-12-31',
          availableAt: '2027-01-05',
          sourceUrl: 'https://example.com',
        },
      ],
      '2027-01-01',
    ).outcome,
    null,
  )
  assert.equal(
    resolveNumericForecast(
      f,
      [
        {
          id: 'new',
          metric: 'revenue',
          value: 110,
          period: '2026-12-31',
          availableAt: '2027-01-05',
          sourceUrl: 'https://example.com',
        },
      ],
      '2027-02-01',
    ).outcome,
    true,
  )
})

test('entry expiry uses exchange DST and full sale preserves avoided-loss attribution', async () => {
  const {
    exchangeOpeningTimestamp,
    evaluateEntryRule,
    riskReductionAttribution,
  } = await import('../lib/markets/recommendation-evaluation.ts')
  assert.equal(
    exchangeOpeningTimestamp('2026-07-06', '09:30'),
    '2026-07-06T13:30:00.000Z',
  )
  assert.equal(
    exchangeOpeningTimestamp('2026-12-07', '09:30'),
    '2026-12-07T14:30:00.000Z',
  )
  const result = evaluateEntryRule({
    issuedDate: '2026-07-03',
    expiresDate: '2026-07-06',
    expiresAt: '2026-07-06T13:00:00Z',
    sessionOpens: { '2026-07-06': '2026-07-06T13:30:00Z' },
    endDate: '2026-07-06',
    sessions: ['2026-07-06'],
    bars: [{ date: '2026-07-06', open: 100, close: 110, high: 111, low: 99 }],
    trigger: 'next_session_open',
    ceiling: null,
  })
  assert.equal(result.status, 'unfilled')
  assert.equal(riskReductionAttribution(0.1, 0, -0.2), 0.1 * 0.2)
  assert.equal(riskReductionAttribution(0.1, 0, null), null)
})

test('owner fills compare unchanged exposure and normalize splits without inventing realized profit', async () => {
  const { evaluateOwnerFills } = await import(
    '../lib/markets/recommendation-evaluation.ts'
  )
  const bar = (date: string, close: number) => ({
    date,
    open: close,
    close,
    high: close,
    low: close,
  })
  const result = evaluateOwnerFills({
    fills: [
      {
        id: 'fill',
        side: 'buy',
        quantity: 10,
        price: 100,
        sessionDate: '2026-07-06',
      },
    ],
    raw: [bar('2026-07-06', 100)],
    adjusted: [bar('2026-07-06', 50), bar('2026-07-10', 55)],
    endDate: '2026-07-10',
    portfolioValue: 10000,
  })
  assert.equal(result.dollarEffect, 100)
  assert.equal(result.portfolioContribution, 0.01)
  const missing = evaluateOwnerFills({
    fills: [
      {
        id: 'fill',
        side: 'sell',
        quantity: 10,
        price: 100,
        sessionDate: '2026-07-06',
      },
    ],
    raw: [],
    adjusted: [],
    endDate: '2026-07-10',
    portfolioValue: 10000,
  })
  assert.equal(missing.dollarEffect, null)
})

test('ticker reuse and retired peers remain outcome data gaps', async () => {
  const { matchEvaluationIdentities } = await import(
    '../lib/markets/recommendation-evaluation.ts'
  )
  assert.deepEqual(
    matchEvaluationIdentities(
      ['ABC', 'PEER', 'SPY'],
      { ABC: 'old', PEER: 'retired', SPY: 'stable' },
      { ABC: 'replacement', SPY: 'stable' },
    ).verified,
    ['SPY'],
  )
  assert.equal(matchEvaluationIdentities(['ABC'], {}, {}).gaps.length, 1)
})
