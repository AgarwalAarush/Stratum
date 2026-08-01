import type { MarketMemo, ScreenerRow } from '../markets/types.ts'
import { calculateMarketState } from '../markets/state.ts'
import { runCodexJson, type CodexExecResult } from './codex-exec.ts'
import { materializeMarketHomeSnapshot } from './market-home.ts'
import { getSupabaseClient } from './supabase.ts'

const ROW_PAGE_SIZE = 1_000

type MarketMemoContent = Omit<MarketMemo, 'generatedAt'>

export function shouldRunMarketSynthesis(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.CODEX_SYNTHESIS_ENABLED !== 'false'
}

function validateMarketMemo(value: unknown): MarketMemoContent {
  if (typeof value !== 'object' || value === null) throw new Error('Market memo is invalid')
  const memo = value as Record<string, unknown>
  if (!Array.isArray(memo.changes) || !Array.isArray(memo.sectorImplications) || !Array.isArray(memo.catalysts) || !Array.isArray(memo.risks) || !Array.isArray(memo.watchItems)) {
    throw new Error('Market memo is incomplete')
  }
  return memo as unknown as MarketMemoContent
}

export async function generateMarketMemo(
  rows: ScreenerRow[],
  dataAsOf: string,
  runner: (prompt: string) => Promise<CodexExecResult<MarketMemoContent>> = (prompt) => runCodexJson({
    prompt,
    schemaPath: 'schemas/market-memo.schema.json',
    validate: validateMarketMemo,
  }),
): Promise<{ memo: MarketMemo; state: ReturnType<typeof calculateMarketState>['state']; inputs: ReturnType<typeof calculateMarketState>['inputs']; metadata: CodexExecResult<MarketMemoContent>['metadata'] }> {
  const { state, inputs } = calculateMarketState(rows, dataAsOf)
  const prompt = `Create a concise institutional market memo from the deterministic market statistics below.

Rules:
- Do not calculate or alter any supplied number.
- Do not invent news, events, earnings dates, sources, or macro releases.
- Every change must cite "Alpaca market data" as its source.
- Catalysts may only describe data-dependent conditions to monitor, not unsupplied calendar events.
- Keep each item short, specific, and analytical.
- Return only the schema-constrained JSON.

Market state: ${state.regime}
Confidence: ${state.confidence}%
Data as of: ${dataAsOf}
Advancing stocks: ${inputs.advancingPercent}%
Stocks above 50-day average: ${inputs.aboveFiftyDayPercent}%
Average daily change: ${inputs.averageChange}%
Leaders: ${JSON.stringify(inputs.leaders)}
Laggards: ${JSON.stringify(inputs.laggards)}
Instruments: ${JSON.stringify(inputs.instruments)}`

  const result = await runner(prompt)
  return {
    memo: { ...result.data, generatedAt: new Date().toISOString() },
    state,
    inputs,
    metadata: result.metadata,
  }
}

export async function materializeMarketMemo(
  snapshotId: string,
  options: { synthesize?: boolean } = {},
): Promise<{ marketStateId: string; generatedAt: string; synthesized: boolean }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')

  const { data: snapshot, error: snapshotError } = await supabase
    .from('market_snapshots')
    .select('id,data_as_of,status')
    .eq('id', snapshotId)
    .eq('status', 'complete')
    .single()
  if (snapshotError || !snapshot) throw new Error(`Completed market snapshot not found: ${snapshotError?.message ?? snapshotId}`)

  const rows: ScreenerRow[] = []
  for (let from = 0; ; from += ROW_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('screener_rows')
      .select('symbol,company,price,daily_change,return_5d,return_30d,return_90d,return_180d,return_ytd,return_1y,gap,volume,relative_volume,range_values,fifty_day_average,fifty_two_week_position,exchange,sector,sub_industry,tradable,data_as_of')
      .eq('snapshot_id', snapshotId)
      .range(from, from + ROW_PAGE_SIZE - 1)
    if (error) throw new Error(`Unable to load screener rows: ${error.message}`)
    const page = (data ?? []).map((row) => ({
      symbol: row.symbol,
      company: row.company,
      price: Number(row.price),
      dailyChange: Number(row.daily_change),
      return5d: row.return_5d == null ? null : Number(row.return_5d),
      return30d: row.return_30d == null ? null : Number(row.return_30d),
      return90d: row.return_90d == null ? null : Number(row.return_90d),
      return180d: row.return_180d == null ? null : Number(row.return_180d),
      returnYtd: row.return_ytd == null ? null : Number(row.return_ytd),
      return1y: row.return_1y == null ? null : Number(row.return_1y),
      gap: Number(row.gap),
      volume: Number(row.volume),
      relativeVolume: Number(row.relative_volume),
      range: Array.isArray(row.range_values) ? row.range_values.map(Number) : [],
      fiftyDayAverage: Number(row.fifty_day_average),
      fiftyTwoWeekPosition: Number(row.fifty_two_week_position),
      exchange: row.exchange,
      sector: row.sector ?? 'Unclassified',
      subIndustry: row.sub_industry ?? 'Unclassified',
      tradable: row.tradable,
      asOf: row.data_as_of,
    }))
    rows.push(...page)
    if (page.length < ROW_PAGE_SIZE) break
  }

  const deterministic = calculateMarketState(rows, snapshot.data_as_of)
  const stateGeneratedAt = new Date().toISOString()
  const { data: stateRecord, error: stateError } = await supabase
    .from('market_states')
    .upsert({
      snapshot_id: snapshotId,
      regime: deterministic.state.regime,
      confidence: deterministic.state.confidence,
      inputs: deterministic.inputs,
      data_as_of: deterministic.state.dataAsOf,
      generated_at: stateGeneratedAt,
    }, { onConflict: 'snapshot_id' })
    .select('id')
    .single()
  if (stateError || !stateRecord) throw new Error(`Unable to persist market state: ${stateError?.message ?? 'unknown error'}`)

  if (options.synthesize === false || !shouldRunMarketSynthesis()) {
    await materializeMarketHomeSnapshot(snapshotId)
    return { marketStateId: stateRecord.id, generatedAt: stateGeneratedAt, synthesized: false }
  }

  const generated = await generateMarketMemo(rows, snapshot.data_as_of)
  const evidence = [{
    id: 'alpaca-market-data',
    source: 'Alpaca Market Data',
    publishedAt: generated.state.dataAsOf,
    url: 'https://alpaca.markets/data',
  }]
  const { error: memoError } = await supabase.from('market_memos').upsert({
    market_state_id: stateRecord.id,
    content: generated.memo,
    sources: evidence,
    provider: 'codex',
    model: generated.metadata.model,
    generated_at: generated.memo.generatedAt,
  }, { onConflict: 'market_state_id' })
  if (memoError) throw new Error(`Unable to persist market memo: ${memoError.message}`)

  await materializeMarketHomeSnapshot(snapshotId)

  return { marketStateId: stateRecord.id, generatedAt: generated.memo.generatedAt, synthesized: true }
}
