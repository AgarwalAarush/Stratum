import { resolveNumericForecast } from '../markets/investment-learning.ts'
import { getAlpacaClient } from './alpaca.ts'
import { contentHash, investmentDb, record } from './recommendations.ts'
import {
  attributeDecision,
  calibration,
  evaluateMarkout,
  evaluateEntryRule,
  exchangeOpeningTimestamp,
  riskReductionAttribution,
  evaluateOwnerFills,
} from '../markets/recommendation-evaluation.ts'
import { MARKETS_OWNER_ID } from '../auth/markets-auth.ts'
import type {
  DecisionContext,
  Recommendation,
} from '../markets/recommendations.ts'

const EVALUATOR = 'prospective-v1'
async function appendEvaluation(
  ownerId: string,
  recommendationId: string,
  kind: string,
  horizon: string,
  content: unknown,
  now: Date,
) {
  const db = investmentDb(),
    hash = contentHash(content)
  const prior = await db
    .from('recommendation_evaluations')
    .select('id,content_hash')
    .eq('recommendation_id', recommendationId)
    .eq('kind', kind)
    .eq('horizon', horizon)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (prior.error) throw new Error(prior.error.message)
  if (prior.data?.content_hash === hash) return prior.data.id
  const saved = await db
    .from('recommendation_evaluations')
    .insert({
      owner_id: ownerId,
      recommendation_id: recommendationId,
      kind,
      horizon,
      as_of: now.toISOString(),
      evaluator_version: EVALUATOR,
      supersedes_id: prior.data?.id ?? null,
      content,
      content_hash: hash,
    })
    .select('id')
    .single()
  if (saved.error?.code === '23505') return null
  if (saved.error) throw new Error(saved.error.message)
  return saved.data.id
}

export async function evaluateRecommendationOutcomes(now = new Date()) {
  const db = investmentDb(),
    alpaca = getAlpacaClient()
  if (!alpaca)
    throw new Error(
      'Alpaca is required for exchange-calendar outcome evaluation',
    )
  const tasks = await db
    .from('recommendation_evaluation_tasks')
    .select('*')
    .in('status', ['pending', 'needs_data'])
    .lte('not_before', now.toISOString())
    .order('not_before')
    .limit(100)
  if (tasks.error) throw new Error(tasks.error.message)
  let complete = 0,
    needsData = 0
  for (const task of tasks.data ?? []) {
    try {
      const row = await db
        .from('recommendation_versions')
        .select('*,recommendation_batches(manifest_id)')
        .eq('id', task.recommendation_id)
        .single()
      if (row.error) throw new Error(row.error.message)
      const rec = row.data.content as Recommendation,
        issued = row.data.issued_at as string
      const manifestId = record(row.data.recommendation_batches).manifest_id
      const manifest = await db
        .from('recommendation_input_manifests')
        .select('content')
        .eq('id', manifestId)
        .single()
      if (manifest.error) throw new Error(manifest.error.message)
      const context = manifest.data.content as DecisionContext
      const name = context.names.find(
        (n) => n.symbol === rec.symbol && n.portfolioId === rec.portfolioId,
      )!
      if (task.kind === 'thesis') {
        const forecast = await db
          .from('recommendation_forecasts')
          .select('*')
          .eq('recommendation_id', row.data.id)
          .eq('ordinal', Number(task.horizon))
          .single()
        if (forecast.error) throw new Error(forecast.error.message)
        const f = record(forecast.data.content)
        const observations: Array<{
          id: string
          metric: string
          value: number
          period: string
          availableAt: string
          sourceUrl: string
        }> = []
        if (String(f.metric).startsWith('FRED:')) {
          const series = String(f.metric).slice(5)
          const vintages = await db
            .from('investment_macro_vintages')
            .select('*')
            .eq('series_id', series)
            .gt('observed_at', issued)
            .lte('observed_at', now.toISOString())
            .order('observed_at')
            .limit(500)
          if (vintages.error) throw new Error(vintages.error.message)
          for (const vintage of vintages.data ?? [])
            for (const raw of Array.isArray(vintage.content.observations)
              ? vintage.content.observations
              : []) {
              observations.push({
                id: vintage.id,
                metric: String(f.metric),
                value: Number(raw.value),
                period: String(raw.date),
                availableAt: vintage.observed_at,
                sourceUrl: String(vintage.content.sourceUrl),
              })
            }
        } else {
          const values = await db
            .from('world_observations')
            .select(
              'id,numeric_value,valid_from,ingested_at,metadata,world_documents!inner(canonical_url)',
            )
            .contains('metadata', { metric: f.metric, symbol: rec.symbol })
            .gt('ingested_at', issued)
            .lte('ingested_at', now.toISOString())
            .order('ingested_at')
            .limit(500)
          if (values.error) throw new Error(values.error.message)
          for (const value of values.data ?? [])
            if (value.numeric_value !== null && value.valid_from)
              observations.push({
                id: value.id,
                metric: String(f.metric),
                value: Number(value.numeric_value),
                period: String(value.valid_from).slice(0, 10),
                availableAt: value.ingested_at,
                sourceUrl: String(record(value.world_documents).canonical_url),
              })
        }
        const assessment = resolveNumericForecast(
          {
            operator: f.operator as 'gt' | 'lt',
            threshold: Number(f.threshold),
            deadline: forecast.data.deadline,
            issuedAt: issued,
            metric: String(f.metric),
          },
          observations,
          now.toISOString(),
        )
        await appendEvaluation(
          task.owner_id,
          row.data.id,
          'thesis',
          task.horizon,
          {
            forecastId: forecast.data.id,
            ...assessment,
            probability: forecast.data.probability,
            forecast: f,
            reason:
              assessment.outcome === null
                ? 'Deadline reached without an exact, dated economic metric observation. Price performance cannot resolve this forecast.'
                : 'Resolved against the declared metric and threshold using the first captured eligible vintage. Later revisions append a separate assessment.',
            observationCutoff: now.toISOString(),
          },
          now,
        )
        if (assessment.outcome !== null) {
          const update = await db
            .from('recommendation_evaluation_tasks')
            .update({
              status: 'complete',
              last_checked_at: now.toISOString(),
              error: null,
            })
            .eq('id', task.id)
          if (update.error) throw new Error(update.error.message)
          complete++
          continue
        }
        const next = await db
          .from('recommendation_evaluation_tasks')
          .update({
            status: 'needs_data',
            last_checked_at: now.toISOString(),
            not_before: new Date(now.getTime() + 7 * 86400000).toISOString(),
            error: 'Awaiting economic evidence/adjudication',
          })
          .eq('id', task.id)
        if (next.error) throw new Error(next.error.message)
        needsData++
        continue
      }
      const issuedDate = new Date(issued).toLocaleDateString('en-CA', {
        timeZone: 'America/New_York',
      })
      const today = now.toLocaleDateString('en-CA', {
        timeZone: 'America/New_York',
      })
      const calendar = await alpaca.fetchCalendar(issuedDate, today)
      // Current-day bars can still be forming or delayed. Use completed prior sessions.
      const completed = calendar.filter((c) => c.date < today)
      const after = completed.filter((c) => c.date > issuedDate)
      const horizon =
        task.horizon === 'thesis_horizon'
          ? after.filter(
              (c) =>
                c.date <=
                new Date(Date.parse(issued) + rec.horizonDays * 86400000)
                  .toISOString()
                  .slice(0, 10),
            ).length
          : Number(task.horizon)
      if (horizon < 1 || after.length < horizon)
        throw new Error('Required exchange sessions have not completed')
      const endpoint = after[horizon - 1].date
      const policy = name.evaluationPolicy ?? {
        benchmark: 'SPY',
        peers: [],
        peerSelection: 'No peers fixed at issuance',
        costBps: 20,
        baselineWeight: 0.05,
        execution: 'next_session_open',
      }
      const symbols = [
        ...new Set([rec.symbol, policy.benchmark, ...policy.peers]),
      ]
      const result = await alpaca.fetchDailyBars(
        symbols,
        `${issuedDate}T00:00:00Z`,
        `${endpoint}T23:59:59Z`,
      )
      const vintage = now.toISOString()
      const saved = await db.from('investment_price_vintages').upsert(
        result.data.map((bar) => ({
          symbol: bar.symbol,
          security_id:
            bar.symbol === rec.symbol
              ? name.securityId
              : `unresolved-symbol:${bar.symbol}`,
          session_date: bar.tradingDate,
          feed: result.feed,
          adjustment: 'all',
          observed_at: vintage,
          source_as_of: bar.asOf,
          content_hash: contentHash(bar),
          content: bar,
        })),
        {
          onConflict: 'symbol,session_date,feed,adjustment,content_hash',
          ignoreDuplicates: true,
        },
      )
      if (saved.error) throw new Error(saved.error.message)
      const bars = (symbol: string) =>
        result.data
          .filter((b) => b.symbol === symbol)
          .map((b) => ({
            date: b.tradingDate,
            open: b.open,
            close: b.close,
            high: b.high,
            low: b.low,
          }))
      const markout = evaluateMarkout({
        issuedDate,
        sessions: calendar.map((c) => c.date),
        completedThrough: completed.at(-1)?.date ?? '',
        horizon,
        bars: bars(rec.symbol),
        benchmark: bars(policy.benchmark),
        costBps: policy.costBps,
        maxEntryPrice: rec.entry.maxPrice,
      })
      const peerResults = policy.peers.map((symbol) => ({
        symbol,
        result: evaluateMarkout({
          issuedDate,
          sessions: calendar.map((c) => c.date),
          completedThrough: completed.at(-1)?.date ?? '',
          horizon,
          bars: bars(symbol),
          benchmark: bars(policy.benchmark),
          costBps: 0,
        }),
      }))
      const peerReturn =
        peerResults.length &&
        peerResults.every((p) => p.result.grossReturn !== null)
          ? peerResults.reduce((sum, p) => sum + p.result.grossReturn!, 0) /
            peerResults.length
          : null
      const entryRule = evaluateEntryRule({
        issuedDate,
        expiresDate: new Date(rec.expiresAt).toLocaleDateString('en-CA', {
          timeZone: 'America/New_York',
        }),
        expiresAt: rec.expiresAt,
        sessionOpens: Object.fromEntries(
          calendar.map((c) => [
            c.date,
            exchangeOpeningTimestamp(c.date, c.open),
          ]),
        ),
        endDate: endpoint,
        bars: bars(rec.symbol),
        sessions: calendar.map((c) => c.date),
        trigger: rec.entry.trigger ?? 'manual_condition',
        ceiling: rec.entry.maxPrice,
      })
      const eventRows = await db
        .from('recommendation_owner_events')
        .select('*')
        .eq('recommendation_id', row.data.id)
        .lte('recorded_at', vintage)
        .order('recorded_at')
      if (eventRows.error) throw new Error(eventRows.error.message)
      const corrected = new Set(
        (eventRows.data ?? [])
          .filter((e) => e.event_type === 'correction')
          .map((e) => record(e.details).supersedesEventId),
      )
      const fills = (eventRows.data ?? [])
        .filter(
          (e) =>
            !corrected.has(e.id) &&
            ['manually_executed', 'correction'].includes(e.event_type) &&
            e.occurred_at >= issued &&
            new Date(e.occurred_at).toLocaleDateString('en-CA', {
              timeZone: 'America/New_York',
            }) <= endpoint,
        )
        .flatMap((e) => {
          const d = record(e.details)
          return ['buy', 'sell'].includes(String(d.side)) &&
            Number(d.quantity) > 0 &&
            Number(d.price) > 0
            ? [
                {
                  id: e.id,
                  side: d.side as 'buy' | 'sell',
                  quantity: Number(d.quantity),
                  price: Number(d.price),
                  sessionDate: new Date(e.occurred_at).toLocaleDateString(
                    'en-CA',
                    { timeZone: 'America/New_York' },
                  ),
                },
              ]
            : []
        })
      let ownerOutcome: ReturnType<typeof evaluateOwnerFills> | null = null
      if (fills.length) {
        const raw = await alpaca.fetchDailyBars(
          [rec.symbol],
          `${issuedDate}T00:00:00Z`,
          `${endpoint}T23:59:59Z`,
          result.feed,
          'raw',
        )
        if (raw.feed !== result.feed)
          throw new Error(
            'Raw and adjusted owner-outcome vintages use different feeds',
          )
        const rawSaved = await db.from('investment_price_vintages').upsert(
          raw.data.map((bar) => ({
            symbol: bar.symbol,
            security_id: name.securityId,
            session_date: bar.tradingDate,
            feed: raw.feed,
            adjustment: 'raw',
            observed_at: vintage,
            source_as_of: bar.asOf,
            content_hash: contentHash(bar),
            content: bar,
          })),
          {
            onConflict: 'symbol,session_date,feed,adjustment,content_hash',
            ignoreDuplicates: true,
          },
        )
        if (rawSaved.error) throw new Error(rawSaved.error.message)
        ownerOutcome = evaluateOwnerFills({
          fills,
          raw: raw.data.map((b) => ({
            date: b.tradingDate,
            open: b.open,
            close: b.close,
            high: b.high,
            low: b.low,
          })),
          adjusted: bars(rec.symbol),
          endDate: endpoint,
          portfolioValue: name.portfolioValue,
        })
      }
      const content = {
        ...markout,
        policy: {
          ...policy,
          benchmark: policy.benchmark,
          execution: 'next session strictly after publication, at open',
          adjustment:
            'all: provider split/dividend adjustment; no dividends added again',
          costBps: 20,
          feed: result.feed,
          evaluator: EVALUATOR,
        },
        priceVintage: vintage,
        priceHash: contentHash(result.data),
        securityId: name.securityId,
        calendar: calendar.filter((c) => c.date <= endpoint),
        action: rec.action,
        actualExecution: ownerOutcome
          ? 'Owner-reported fills linked; not broker reconciled'
          : 'No owner fill reported',
        ownerOutcome,
        peerRelative:
          peerReturn !== null && markout.grossReturn !== null
            ? markout.grossReturn - peerReturn
            : null,
        peerResults,
        peerReason: policy.peerSelection,
        entryRule,
      }
      await appendEvaluation(
        task.owner_id,
        row.data.id,
        'markout',
        task.horizon,
        content,
        now,
      )
      if (markout.status !== 'resolved') throw new Error(markout.reason)
      const target =
        rec.entry.targetWeightPct === null
          ? null
          : rec.entry.targetWeightPct / 100
      const attribution = attributeDecision({
        selectionReturn: markout.grossReturn,
        benchmarkReturn: markout.benchmarkReturn,
        timedReturn: entryRule.return,
        baselineWeight: policy.baselineWeight,
        recommendedWeight: target,
        riskManagedReturn:
          ['sell', 'trim'].includes(rec.action) &&
          entryRule.status === 'triggered'
            ? 0
            : null,
        ownerReturn: ownerOutcome?.portfolioContribution ?? null,
      })
      await appendEvaluation(
        task.owner_id,
        row.data.id,
        'attribution',
        task.horizon,
        {
          ...attribution,
          riskManagement:
            ['sell', 'trim'].includes(rec.action) &&
            entryRule.status === 'triggered'
              ? riskReductionAttribution(
                  name.currentWeightPct === null
                    ? null
                    : name.currentWeightPct / 100,
                  target,
                  entryRule.return,
                )
              : null,
          unchangedPositionReturn: markout.grossReturn,
          reason:
            'Signal selection is measurable. Timing and sizing use the fixed entry rule when evaluable. Risk-reduction counterfactual holds sale proceeds in zero-yield cash; owner-reported incremental trade outcomes are retained separately from model execution.',
          action: rec.action,
        },
        now,
      )
      const updated = await db
        .from('recommendation_evaluation_tasks')
        .update({
          status: 'complete',
          last_checked_at: now.toISOString(),
          error: null,
        })
        .eq('id', task.id)
      if (updated.error) throw new Error(updated.error.message)
      complete++
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Evaluation failed'
      const update = await db
        .from('recommendation_evaluation_tasks')
        .update({
          status: 'needs_data',
          error: error.slice(0, 1000),
          last_checked_at: now.toISOString(),
          not_before: new Date(now.getTime() + 86400000).toISOString(),
        })
        .eq('id', task.id)
      if (update.error) throw new Error(update.error.message)
      needsData++
    }
  }
  return { complete, needsData }
}

export async function adjudicateRecommendationForecast(
  ownerId: string,
  input: Record<string, unknown>,
  now = new Date(),
) {
  const db = investmentDb(),
    id = String(input.forecastId ?? ''),
    value = Number(input.observedValue)
  if (
    !Number.isFinite(value) ||
    String(input.rationale ?? '').trim().length < 20 ||
    !Array.isArray(input.evidence) ||
    !input.evidence.length
  )
    throw new Error(
      'Metric value, substantive rationale and dated source evidence are required',
    )
  const forecast = await db
    .from('recommendation_forecasts')
    .select('*')
    .eq('id', id)
    .eq('owner_id', ownerId)
    .single()
  if (forecast.error) throw new Error('Forecast not found for owner')
  if (Date.parse(forecast.data.deadline) > now.getTime())
    throw new Error(
      'Forecast deadline has not arrived; record monitoring evidence without resolving it early',
    )
  const evidence = input.evidence.map((v) => {
    const e = record(v)
    if (
      !/^https:\/\//.test(String(e.url)) ||
      !Number.isFinite(Date.parse(String(e.availableAt))) ||
      Date.parse(String(e.availableAt)) > now.getTime()
    )
      throw new Error(
        'Evidence requires an HTTPS source and valid availability time',
      )
    return e
  })
  const f = record(forecast.data.content),
    outcome =
      f.operator === 'gt'
        ? value > Number(f.threshold)
        : value < Number(f.threshold)
  await appendEvaluation(
    ownerId,
    forecast.data.recommendation_id,
    'thesis',
    String(forecast.data.ordinal),
    {
      forecastId: id,
      status: outcome ? 'confirmed' : 'disconfirmed',
      outcome,
      observedValue: value,
      metric: f.metric,
      probability: forecast.data.probability,
      evidence,
      rationale: input.rationale,
      adjudicator: 'owner',
      contraryEvidence: input.contraryEvidence ?? [],
      observationCutoff: now.toISOString(),
    },
    now,
  )
  const update = await db
    .from('recommendation_evaluation_tasks')
    .update({
      status: 'complete',
      error: null,
      last_checked_at: now.toISOString(),
    })
    .eq('recommendation_id', forecast.data.recommendation_id)
    .eq('kind', 'thesis')
    .eq('horizon', String(forecast.data.ordinal))
  if (update.error) throw new Error(update.error.message)
  return { outcome }
}

export async function reviewRecommendationCohort(
  ownerId = MARKETS_OWNER_ID,
  now = new Date(),
) {
  const db = investmentDb()
  const recommendations: Record<string, unknown>[] = [],
    evaluations: Record<string, unknown>[] = [],
    forecasts: Record<string, unknown>[] = []
  for (const [table, target] of [
    ['recommendation_versions', recommendations],
    ['recommendation_evaluations', evaluations],
    ['recommendation_forecasts', forecasts],
  ] as const) {
    for (let offset = 0; ; offset += 500) {
      const res = await db
        .from(table)
        .select('*')
        .eq('owner_id', ownerId)
        .order(
          table === 'recommendation_versions'
            ? 'issued_at'
            : table === 'recommendation_forecasts'
              ? 'deadline'
              : 'created_at',
          { ascending: false },
        )
        .order('id')
        .range(offset, offset + 499)
      if (res.error) throw new Error(res.error.message)
      target.push(...res.data)
      if (res.data.length < 500) break
    }
  }
  const latest = new Map<string, Record<string, unknown>>()
  for (const e of evaluations)
    if (
      e.kind === 'thesis' &&
      !latest.has(`${e.recommendation_id}:${e.horizon}`)
    )
      latest.set(`${e.recommendation_id}:${e.horizon}`, e)
  const observations = forecasts
    .sort(
      (a, b) =>
        String(
          recommendations.find((r) => r.id === a.recommendation_id)?.issued_at,
        ).localeCompare(
          String(
            recommendations.find((r) => r.id === b.recommendation_id)
              ?.issued_at,
          ),
        ) || Number(a.ordinal) - Number(b.ordinal),
    )
    .map((f) => {
      const assessment = record(
          latest.get(`${f.recommendation_id}:${f.ordinal}`)?.content,
        ),
        r = recommendations.find((r) => r.id === f.recommendation_id)
      return {
        episodeId: String(r?.episode_id ?? f.recommendation_id),
        probability: Number(f.probability),
        outcome:
          typeof assessment.outcome === 'boolean' ? assessment.outcome : null,
      }
    })
  const gateCounts = new Map<string, number>()
  for (const r of recommendations)
    for (const reason of Array.isArray(record(r.content).gateReasons)
      ? (record(r.content).gateReasons as string[])
      : [])
      gateCounts.set(reason, (gateCounts.get(reason) ?? 0) + 1)
  const mostFrequentGate =
    [...gateCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null
  const content = {
    asOf: now.toISOString(),
    denominator: recommendations.length,
    actions: Object.fromEntries(
      [
        'research',
        'watch',
        'buy',
        'add',
        'hold',
        'trim',
        'sell',
        'no_trade',
      ].map((a) => [a, recommendations.filter((r) => r.action === a).length]),
    ),
    calibration: calibration(observations),
    learning: {
      status: 'observation_only',
      mostFrequentGate,
      proposedChange: mostFrequentGate
        ? `Investigate the most frequent observed gate (${mostFrequentGate[1]} versions): ${mostFrequentGate[0]}`
        : 'No repeated evidence gate identified; collect prospective outcomes before proposing a threshold change.',
      promotion:
        'Disabled until a preregistered prospective comparison has matured and the owner approves.',
      biasControls: [
        'Frozen evidence and original probabilities',
        'Keep abstentions and overrides',
        'Cluster repeated versions by episode',
        'No retrospective latest-context backtest',
        'No automatic policy or thesis changes',
      ],
    },
  }
  const key = now.toISOString().slice(0, 10)
  const saved = await db
    .from('recommendation_cohort_reviews')
    .insert({
      owner_id: ownerId,
      cohort_key: key,
      policy_version: EVALUATOR,
      content,
      content_hash: contentHash(content),
    })
  if (saved.error && saved.error.code !== '23505')
    throw new Error(saved.error.message)
  return content
}
