import test from 'node:test'
import assert from 'node:assert/strict'
import {
  captureShadowPolicies,
  evaluateShadowPolicies,
} from '../lib/server/investment-shadow.ts'

test('shadow capture is prospective, retry safe and resolves only from dated economic assessments', async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-key'
  const original = globalThis.fetch
  const runs: Record<string, unknown>[] = [],
    scores: Record<string, unknown>[] = []
  let registrationTime = '2026-09-01',
    cutoff = '2026-09-07T14:00:00Z',
    outcome: boolean | null = null
  const forecast = {
    metric: 'revenue',
    operator: 'gt',
    threshold: 100,
    deadline: '2026-10-01T00:00:00Z',
    probability: 0.9,
  }
  const experiment = {
    id: 'experiment',
    owner_id: 'owner',
    event_type: 'registered',
    policy_key: 'forecast-shrink-20-v1',
    content: {
      baselinePolicy: 'prospective-v1.2',
      startsAt: '2026-09-02',
      endsAt: '2026-11-01',
      embargoDays: 20,
    },
  }
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)),
      table = url.pathname.split('/').at(-1)
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      if (table === 'recommendation_shadow_runs')
        runs.push({ ...body, id: 'run' })
      if (table === 'recommendation_shadow_evaluations') scores.push(body)
      return new Response(null, { status: 201 })
    }
    const data =
      table === 'recommendation_batches'
        ? { owner_id: 'owner', manifest_id: 'manifest' }
        : table === 'recommendation_input_manifests'
          ? {
              content: {
                policy: 'prospective-v1.2',
                cutoff,
                codeVersion: 'fixture',
              },
            }
          : table === 'recommendation_versions'
            ? [
                {
                  id: 'recommendation',
                  security_id: 'stable-id',
                  episode_id: 'episode',
                  issued_at: cutoff,
                  content: {
                    symbol: 'ABC',
                    action: 'watch',
                    forecasts: [forecast],
                  },
                },
              ]
            : table === 'recommendation_policy_experiments'
              ? [{ ...experiment, created_at: registrationTime }]
              : table === 'recommendation_shadow_runs'
                ? runs
                : table === 'recommendation_evaluations'
                  ? outcome === null
                    ? []
                    : [
                        {
                          id: 'economic-assessment',
                          kind: 'thesis',
                          horizon: '0',
                          as_of: '2026-10-02',
                          created_at: '2026-10-02',
                          content: { outcome },
                        },
                      ]
                  : []
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  try {
    assert.deepEqual(
      await captureShadowPolicies('batch', new Date('2026-09-07T14:01:00Z')),
      { captured: 1 },
    )
    assert.deepEqual(
      await captureShadowPolicies('batch', new Date('2026-09-07T14:02:00Z')),
      { captured: 0 },
    )
    await evaluateShadowPolicies('owner', new Date('2026-09-08'))
    assert.equal(
      (scores[0].content as Record<string, unknown>).baselineBrier,
      null,
    )
    outcome = false
    await evaluateShadowPolicies('owner', new Date('2026-10-03'))
    assert.equal(
      (scores[1].content as Record<string, unknown>).baselineBrier,
      0.81,
    )
    assert.equal(
      (scores[1].content as Record<string, unknown>).promotionEligible,
      false,
    )
    // A legacy shadow run can already contain a rejected probability. Retain
    // that run verbatim, but exclude it even when a later outcome is known.
    const comparison = ((runs[0].content as Record<string, unknown>).comparisons as Array<Record<string, unknown>>)[0]
    ;(comparison.baseline as Record<string, unknown>).gateReasons = ['Critic rejected forecast']
    await evaluateShadowPolicies('owner', new Date('2026-10-03'))
    assert.equal((scores[2].content as Record<string, unknown>).baselineBrier, null)
    assert.equal((scores[2].content as Record<string, unknown>).excludedForecasts, 1)
    assert.equal(((comparison.baseline as Record<string, unknown>).forecasts as unknown[]).length, 1)
    runs.length = 0
    registrationTime = '2026-09-08'
    assert.deepEqual(
      await captureShadowPolicies('batch', new Date('2026-09-09')),
      { captured: 0 },
      'Cannot register after seeing the baseline',
    )
    registrationTime = '2026-09-01'
    assert.deepEqual(
      await captureShadowPolicies('batch', new Date('2026-10-02')),
      { captured: 0 },
      'Cannot backfill an experiment after its outcome deadline',
    )
    cutoff = '2026-12-01'
    assert.deepEqual(
      await captureShadowPolicies('batch', new Date('2026-12-01')),
      { captured: 0 },
      'Outside prospective window',
    )
  } finally {
    globalThis.fetch = original
  }
})
