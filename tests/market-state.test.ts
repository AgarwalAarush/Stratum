import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { calculateMarketState } from '../lib/markets/state.ts'
import { buildCodexExecArgs } from '../lib/server/codex-exec.ts'
import { generateMarketMemo } from '../lib/server/market-memo.ts'
import type { ScreenerRow } from '../lib/markets/types.ts'

function row(symbol: string, dailyChange: number, price = 110, fiftyDayAverage = 100): ScreenerRow {
  return {
    symbol,
    company: symbol,
    price,
    dailyChange,
    gap: dailyChange / 2,
    volume: 1_000_000,
    relativeVolume: 2,
    range: [100, 105, price],
    fiftyDayAverage,
    fiftyTwoWeekPosition: 75,
    exchange: 'NASDAQ',
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
  assert.deepEqual(result.inputs.instruments.map((instrument) => instrument.id), ['spy', 'qqq', 'iwm'])
})

test('Codex runner arguments enforce ephemeral read-only schema output', () => {
  const args = buildCodexExecArgs({
    model: 'gpt-5.6-terra',
    schemaPath: '/repo/schemas/market-memo.schema.json',
    outputPath: '/tmp/output.json',
    cwd: '/repo',
  })
  assert.deepEqual(args, [
    'exec', '--model', 'gpt-5.6-terra', '--ephemeral', '--sandbox', 'read-only',
    '--config', 'approval_policy="never"', '--cd', '/repo',
    '--output-schema', '/repo/schemas/market-memo.schema.json',
    '--output-last-message', '/tmp/output.json', '-',
  ])
})

test('market memo output schema is checked in and strict', async () => {
  const schema = JSON.parse(await readFile(new URL('../schemas/market-memo.schema.json', import.meta.url), 'utf8'))
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(schema.required, ['changes', 'sectorImplications', 'catalysts', 'risks', 'watchItems'])
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
