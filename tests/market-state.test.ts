import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { buildDeterministicMarketMemo, calculateMarketState } from '../lib/markets/state.ts'
import { buildCodexExecArgs, buildCodexExecEnv } from '../lib/server/codex-exec.ts'
import { generateMarketMemo, shouldRunMarketSynthesis } from '../lib/server/market-memo.ts'
import type { ScreenerRow } from '../lib/markets/types.ts'

function row(symbol: string, dailyChange: number, price = 110, fiftyDayAverage = 100): ScreenerRow {
  return {
    symbol,
    company: symbol,
    price,
    dailyChange,
    return5d: dailyChange,
    return30d: dailyChange,
    return90d: dailyChange,
    return180d: dailyChange,
    returnYtd: dailyChange,
    return1y: dailyChange,
    gap: dailyChange / 2,
    volume: 1_000_000,
    relativeVolume: 2,
    range: [100, 105, price],
    fiftyDayAverage,
    fiftyTwoWeekPosition: 75,
    exchange: 'NASDAQ',
    sector: 'Information Technology',
    subIndustry: 'Systems Software',
    tradable: true,
    asOf: '2026-07-15T20:00:00Z',
  }
}

test('market state is calculated deterministically from normalized rows', () => {
  const rows = [row('SPY', 1), row('QQQ', 2), row('IWM', 1.5), row('AAPL', 0.5), row('MSFT', -0.2)]
  const result = calculateMarketState(rows, '2026-07-15T20:00:00Z')

  assert.equal(result.state.regime, 'Risk-On, broadening participation')
  assert.equal(result.inputs.advancingPercent, 80)
  assert.equal(result.inputs.aboveFiftyDayPercent, 100)
  assert.deepEqual(result.inputs.instruments, [])
})

test('market overview has a source-backed deterministic memo without Codex', () => {
  const rows = [row('SPY', 1), row('QQQ', 2), row('IWM', -1), row('AAPL', 0.5), row('MSFT', -0.2)]
  const { inputs } = calculateMarketState(rows, '2026-07-15T20:00:00Z')
  const memo = buildDeterministicMarketMemo(inputs, '2026-07-15T20:00:00Z', '2026-07-15T20:01:00Z')

  assert.equal(memo.changes.length, 3)
  assert.ok(memo.changes.every((change) => change.source === 'Alpaca market data'))
  assert.match(memo.changes[0]?.body ?? '', /tracked universe/)
  assert.match(memo.changes[2]?.body ?? '', /QQQ \+2.00%/)
  assert.equal(memo.generatedAt, '2026-07-15T20:01:00Z')
})

test('market synthesis can be disabled while deterministic state stays live', () => {
  assert.equal(shouldRunMarketSynthesis({ CODEX_SYNTHESIS_ENABLED: 'false' }), false)
  assert.equal(shouldRunMarketSynthesis({ CODEX_SYNTHESIS_ENABLED: 'true' }), true)
  assert.equal(shouldRunMarketSynthesis({}), true)
})

test('Codex runner arguments enforce ephemeral read-only schema output', () => {
  const args = buildCodexExecArgs({
    model: 'gpt-5.6-terra',
    schemaPath: '/repo/schemas/market-memo.schema.json',
    outputPath: '/tmp/output.json',
    cwd: '/repo',
  })
  assert.deepEqual(args, [
    'exec', '--model', 'gpt-5.6-terra', '--ephemeral',
    '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--sandbox', 'read-only',
    '--config', 'approval_policy="never"',
    '--config', 'shell_environment_policy.inherit="none"', '--cd', '/repo',
    '--output-schema', '/repo/schemas/market-memo.schema.json',
    '--output-last-message', '/tmp/output.json', '-',
  ])
})

test('Codex runner receives only the scoped credential and safe process settings', () => {
  const env = buildCodexExecEnv({
    PATH: '/usr/bin',
    HOME: '/Users/worker',
    OPENAI_API_KEY: 'worker-key',
    SUPABASE_SERVICE_ROLE_KEY: 'must-not-leak',
    ALPACA_API_SECRET_KEY: 'must-not-leak',
  })

  assert.deepEqual(env, {
    PATH: '/usr/bin',
    HOME: '/Users/worker',
    CODEX_API_KEY: 'worker-key',
  })
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined)
  assert.equal(env.ALPACA_API_SECRET_KEY, undefined)
})

test('Codex runner can fall back to cached CLI authentication without leaking secrets', () => {
  assert.deepEqual(buildCodexExecEnv({
    PATH: '/usr/bin',
    HOME: '/Users/worker',
    SUPABASE_SERVICE_ROLE_KEY: 'must-not-leak',
  }), {
    PATH: '/usr/bin',
    HOME: '/Users/worker',
  })
})

test('market memo output schema is checked in and strict', async () => {
  const schema = JSON.parse(await readFile(new URL('../schemas/market-memo.schema.json', import.meta.url), 'utf8'))
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(schema.required, ['changes', 'sectorImplications', 'catalysts', 'risks', 'watchItems'])
})

test('scheduled intelligence schemas are checked in and strict', async () => {
  for (const file of ['morning-brief.schema.json', 'periodic-overview.schema.json']) {
    const schema = JSON.parse(await readFile(new URL(`../schemas/${file}`, import.meta.url), 'utf8'))
    assert.equal(schema.additionalProperties, false)
  }
})

test('market memo keeps deterministic state separate from Codex narrative', async () => {
  const rows = [row('SPY', 1), row('QQQ', 2), row('IWM', 1.5), row('AAPL', 0.5), row('MSFT', -0.2)]
  let prompt = ''
  const generated = await generateMarketMemo(rows, '2026-07-15T20:00:00Z', async (input) => {
    prompt = input
    return {
      data: {
        changes: [{ id: 'breadth', body: 'Participation broadened.', source: 'Alpaca market data', sourceTime: '2026-07-15T20:00:00Z' }],
        sectorImplications: [{ direction: 'up', text: 'Broad participation supports cyclicals.' }],
        catalysts: ['Watch whether advancing participation holds.'],
        risks: ['Leadership can reverse.'],
        watchItems: ['Breadth above the 50-day average.'],
      },
      metadata: { provider: 'openai', model: 'gpt-5.6-terra', durationMs: 10, status: 'succeeded' },
    }
  })

  assert.equal(generated.state.regime, 'Risk-On, broadening participation')
  assert.match(prompt, /Do not calculate or alter any supplied number/)
  assert.equal(generated.memo.changes[0].source, 'Alpaca market data')
})
