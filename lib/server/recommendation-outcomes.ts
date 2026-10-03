import { outcomePriceBatch, type OutcomePriceRequest } from './outcome-price-batch.ts'
import { economicEpisodeKey } from '../markets/economic-episodes.ts'
import { AGING_CHECKPOINTS, agingEndpoint, agingSemantics, checkpointDate, type AgingCheckpoint } from '../markets/recommendation-aging.ts'
import { forecastsAreApproved, forecastCategory, FORECAST_REVIEW_POLICY } from '../markets/forecast-review.ts'
import { resolveNumericForecast } from '../markets/investment-learning.ts'
import { companyForecastObservations, COMPANY_FORECAST_METRICS, FORECAST_RESOLUTION_POLICY } from '../markets/forecast-metrics.ts'
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
  matchEvaluationIdentities,
} from '../markets/recommendation-evaluation.ts'
import { MARKETS_OWNER_ID } from '../auth/markets-auth.ts'
import type {
  DecisionContext,
  Recommendation,
} from '../markets/recommendations.ts'

const EVALUATOR = FORECAST_RESOLUTION_POLICY
async function appendEvaluation(
  ownerId: string,
  recommendationId: string,
  kind: string,
  horizon: string,
  content: unknown,
  now: Date,
  evaluatorVersion = EVALUATOR,
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
      evaluator_version: evaluatorVersion,
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
  const tasks = await db
    .from('recommendation_evaluation_tasks')
    .select('*')
    .in('status', ['pending', 'needs_data'])
    .lte('not_before', now.toISOString())
    .order('not_before')
    .limit(100)
  if (tasks.error) throw new Error(tasks.error.message)
  const ids = [...new Set((tasks.data ?? []).map(t => t.recommendation_id))]
  if (!ids.length) return {complete: 0, needsData: 0}
  const versions = await db.from('recommendation_versions').select('*,recommendation_batches(manifest_id)').in('id', ids)
  if (versions.error) throw new Error(versions.error.message)
  const manifestIds = [...new Set((versions.data ?? []).map(v => record(v.recommendation_batches).manifest_id))]
  const [manifests, forecastRows, ownerEvents, thesisEvaluations] = await Promise.all([
    db.from('recommendation_input_manifests').select('id,content').in('id', manifestIds),
    db.from('recommendation_forecasts').select('*').in('recommendation_id', ids),
    db.from('recommendation_owner_events').select('*').in('recommendation_id', ids).lte('recorded_at', now.toISOString()).order('recorded_at'),
    db.from('recommendation_evaluations').select('recommendation_id,horizon,content,as_of').in('recommendation_id', ids).eq('kind','thesis').lte('as_of', now.toISOString()).order('as_of',{ascending:false}),
  ])
  for (const r of [manifests, forecastRows, ownerEvents, thesisEvaluations]) if (r.error) throw new Error(r.error.message)
  const priceIds = new Set((tasks.data ?? []).filter(t => t.kind !== 'thesis').map(t => t.recommendation_id))
  const priceVersions = (versions.data ?? []).filter(v => priceIds.has(v.id))
  const firstDate = priceVersions.map(v => new Date(v.issued_at).toLocaleDateString('en-CA',{timeZone:'America/New_York'})).sort()[0]
  const today = now.toLocaleDateString('en-CA',{timeZone:'America/New_York'})
  let priceDependencyError: string | null = null
  let calendarAll: Awaited<ReturnType<NonNullable<typeof alpaca>['fetchCalendar']>> = []
  let currentIdentities: Record<string,string> = {}
  try {
    if (alpaca && firstDate) calendarAll = await alpaca.fetchCalendar(firstDate, today)
    if (alpaca && priceVersions.length) currentIdentities = Object.fromEntries((await alpaca.fetchAssets()).filter(a => a.securityId).map(a => [a.symbol,a.securityId!]))
  } catch (error) {priceDependencyError = error instanceof Error ? error.message : String(error)}
  const priceRequests: OutcomePriceRequest[] = []
  for (const v of priceVersions) {
    const rec = v.content as Recommendation
    const context = manifests.data?.find(m => m.id === record(v.recommendation_batches).manifest_id)?.content as DecisionContext
    const name = context?.names.find(n => n.symbol === rec.symbol && n.portfolioId === rec.portfolioId)
    if (!name) continue
    const symbols = matchEvaluationIdentities([rec.symbol,name.evaluationPolicy?.benchmark ?? 'SPY',...(name.evaluationPolicy?.peers ?? [])], {...name.evaluationPolicy?.securityIds, [rec.symbol]:name.securityId}, currentIdentities).verified
    const start = new Date(v.issued_at).toLocaleDateString('en-CA',{timeZone:'America/New_York'})
    const sessions = calendarAll.filter(c => c.date > start && agingEndpoint([c],today,now) !== null)
    const endpoints = (tasks.data ?? []).filter(t => t.recommendation_id === v.id && t.kind !== 'thesis').flatMap(t => {
      if (t.kind === 'aging') { const end = agingEndpoint(calendarAll,checkpointDate(v.issued_at,t.horizon as AgingCheckpoint),now); return end ? [end] : [] }
      if (t.horizon === 'thesis_horizon') return sessions.filter(c => c.date <= new Date(Date.parse(v.issued_at)+rec.horizonDays*86400000).toISOString().slice(0,10)).slice(-1).map(c => c.date)
      const endpoint = sessions[Number(t.horizon)-1]; return endpoint ? [endpoint.date] : []
    })
    const end = endpoints.sort().at(-1)
    if (!end) continue
    const aging = (tasks.data ?? []).some(t => t.recommendation_id === v.id && t.kind === 'aging')
    const feed = aging && ['iex','sip','delayed_sip'].includes(name.quote?.feed ?? '') ? name.quote!.feed as 'iex'|'sip'|'delayed_sip' : undefined
    priceRequests.push({symbols,start,end,feed,adjustment:'all'})
    if (ownerEvents.data?.some(e => e.recommendation_id === v.id && ['manually_executed','correction'].includes(e.event_type))) priceRequests.push({symbols:[rec.symbol],start,end,feed,adjustment:'raw'})
    // Historical tasks retain their original default-feed evaluator contract.
    if (aging && (tasks.data ?? []).some(t => t.recommendation_id === v.id && !['aging','thesis'].includes(t.kind))) priceRequests.push({symbols,start,end,adjustment:'all'})
  }
  const prices = outcomePriceBatch(priceRequests, async (...args) => {
    if (!alpaca) throw new Error('Alpaca is required for price outcome evaluation')
    return alpaca.fetchDailyBars(...args)
  }, async (result, adjustment) => {
    for (let offset = 0; offset < result.data.length; offset += 500) {
      const saved = await db.from('investment_price_vintages').upsert(result.data.slice(offset,offset+500).map(bar => ({symbol:bar.symbol,security_id:currentIdentities[bar.symbol] ?? `unresolved-symbol:${bar.symbol}`,session_date:bar.tradingDate,feed:result.feed,adjustment,observed_at:now.toISOString(),source_as_of:bar.asOf,content_hash:contentHash(bar),content:bar})),{onConflict:'symbol,session_date,feed,adjustment,content_hash',ignoreDuplicates:true})
      if (saved.error) throw new Error(saved.error.message)
    }
  })
  let complete = 0,
    needsData = 0
  for (const task of tasks.data ?? []) {
    try {
      const version = versions.data?.find(v => v.id === task.recommendation_id)
      if (!version) throw new Error('Missing issued recommendation version')
      const row = {data:version}
      const rec = version.content as Recommendation, issued = version.issued_at as string
      const context = manifests.data?.find(m => m.id === record(version.recommendation_batches).manifest_id)?.content as DecisionContext
      if (!context) throw new Error('Missing frozen recommendation manifest')
      const name = context.names.find(
        (n) => n.symbol === rec.symbol && n.portfolioId === rec.portfolioId,
      )!
      if (task.kind === 'thesis' && !forecastsAreApproved(rec)) {
        await appendEvaluation(row.data.owner_id, row.data.id, 'thesis', String(task.horizon), {
          status: 'excluded', outcome: null, reason: 'Original decision failed evidence or portfolio review; its forecasts are not approved for calibration.',
          reviewPolicy: FORECAST_REVIEW_POLICY,
        }, now)
        const update = await db.from('recommendation_evaluation_tasks').update({status: 'complete', last_checked_at: now.toISOString(), error: null}).eq('id', task.id)
        if (update.error) throw new Error(update.error.message)
        complete++
        continue
      }
      if (task.kind === 'thesis') {
        const value = forecastRows.data?.find(f => f.recommendation_id === row.data.id && f.ordinal === Number(task.horizon))
        if (!value) throw new Error('Missing issued forecast')
        const forecast = {data: value}
        const f = record(forecast.data.content)
        const observations: Array<{
          id: string
          metric: string
          value: number
          period: string
          availableAt: string
          sourceUrl: string
          unit?: string
        }> = []
        const declaredResolution = Boolean(f.observationPeriod && f.unit && f.resolutionSource)
        if (declaredResolution && String(f.metric).startsWith('FRED:')) {
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
              if (raw.value === null || raw.value === undefined || raw.value === '' || raw.value === '.' || !Number.isFinite(Number(raw.value))) continue
              observations.push({
                id: vintage.id,
                metric: String(f.metric),
                value: Number(raw.value),
                period: String(raw.date),
                availableAt: vintage.observed_at,
                sourceUrl: String(vintage.content.sourceUrl),
                unit: String(vintage.content.units),
              })
            }
        } else if (declaredResolution && Object.hasOwn(COMPANY_FORECAST_METRICS, String(f.metric))) {
          const packets = await db.from('company_packets').select('id,generated_at,packet')
            .eq('symbol', rec.symbol).eq('owner_id', task.owner_id).eq('status', 'complete')
            .gt('generated_at', issued).lte('generated_at', now.toISOString()).order('generated_at').limit(100)
          if (packets.error) throw new Error(packets.error.message)
          const frozenPacket = context.evidence.find(e => e.kind === 'company_packet' && name.sources.includes(e.id))
          const issuerCik = record(record(record(frozenPacket?.value).packet).company).cik
          if (typeof issuerCik === 'string' || typeof issuerCik === 'number') observations.push(...companyForecastObservations(String(f.metric), packets.data ?? [], String(issuerCik)))
          if (!observations.some(o => o.period === f.observationPeriod && o.unit === f.unit)) {
            const { enqueueAgentJob } = await import('./agent-job-queue.ts')
            await enqueueAgentJob('refresh-company-packet', { ownerId: task.owner_id, symbol: rec.symbol, reason: 'due economic forecast' },
              `forecast-packet:${task.owner_id}:${rec.symbol}:${now.toISOString().slice(0, 10)}`)
          }
        } else if (declaredResolution) {
          const values = await db
            .from('world_observations')
            .select(
              'id,numeric_value,valid_from,ingested_at,metadata,world_documents!inner(canonical_url)',
            )
            .contains('metadata', { metric: f.metric, symbol: rec.symbol, resolutionSource: f.resolutionSource ?? 'undeclared' })
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
                unit: typeof record(value.metadata).unit === 'string' ? String(record(value.metadata).unit) : undefined,
              })
        }
        const assessment = resolveNumericForecast(
          {
            operator: f.operator as 'gt' | 'lt',
            threshold: Number(f.threshold),
            deadline: forecast.data.deadline,
            issuedAt: issued,
            metric: String(f.metric),
            observationPeriod: typeof f.observationPeriod === 'string' ? f.observationPeriod : undefined,
            unit: typeof f.unit === 'string' ? f.unit : undefined,
            resolutionSource: typeof f.resolutionSource === 'string' ? f.resolutionSource : undefined,
          },
          observations,
          now.toISOString(),
        )
        const evaluationId = await appendEvaluation(
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
              assessment.status === 'unresolvable' ? 'Legacy forecast lacks a frozen period, unit or resolution source; no automatic label is assigned.' : assessment.outcome === null
                ? 'Deadline reached without an exact, dated economic metric observation. Price performance cannot resolve this forecast.'
                : 'Resolved against the declared metric and threshold using the first captured eligible vintage. Later revisions append a separate assessment.',
            observationCutoff: now.toISOString(),
          },
          now,
        )
        if (assessment.status === 'disconfirmed' && f.decisivePremise === true && evaluationId) {
          const { enqueueAgentJob } = await import('./agent-job-queue.ts')
          await enqueueAgentJob(name.instrumentType === 'etf' ? 'generate-etf-research' : 'event-refresh-company-research', { ownerId: task.owner_id, symbol: rec.symbol, instrumentType: name.instrumentType ?? 'equity', reason: `decisive forecast contradiction:${evaluationId}` }, `forecast-feedback:${evaluationId}`)
        }
        if (assessment.outcome !== null || assessment.status === 'unresolvable') {
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
      if (priceDependencyError) throw new Error(priceDependencyError)
      if (!alpaca) throw new Error('Alpaca is required for exchange-calendar outcome evaluation')
      const calendar = calendarAll.filter(c => c.date >= issuedDate)
      // Current-day bars can still be forming or delayed. Use completed prior sessions.
      const completed = calendar.filter(c => agingEndpoint([c], today, now) !== null)
      const aging = task.kind === 'aging'
      const anniversary = aging ? checkpointDate(issued, task.horizon as AgingCheckpoint) : null
      if (aging && !AGING_CHECKPOINTS.includes(task.horizon as AgingCheckpoint)) throw new Error('Unknown calendar checkpoint')
      const checkpointEndpoint = anniversary ? agingEndpoint(calendar, anniversary, now) : null
      const after = completed.filter((c) => c.date > issuedDate)
      const horizon =
        aging
          ? after.filter(c => checkpointEndpoint && c.date <= checkpointEndpoint).length
          : task.horizon === 'thesis_horizon'
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
      const identities = matchEvaluationIdentities(
        symbols,
        {
          ...name.evaluationPolicy?.securityIds,
          [rec.symbol]: name.securityId,
        },
        currentIdentities,
      )
      const result = await prices({symbols:identities.verified,start:issuedDate,end:endpoint,feed:aging && ['iex','sip','delayed_sip'].includes(name.quote?.feed ?? '') ? name.quote!.feed as 'iex'|'sip'|'delayed_sip' : undefined, adjustment:'all'})
      const vintage = now.toISOString()
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
      const eventRows = {data:(ownerEvents.data ?? []).filter(e => e.recommendation_id === row.data.id)}
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
        const raw = await prices({symbols:[rec.symbol],start:issuedDate,end:endpoint,feed:aging && ['iex','sip','delayed_sip'].includes(name.quote?.feed ?? '') ? name.quote!.feed as 'iex'|'sip'|'delayed_sip' : undefined,adjustment:'raw'})
        if (raw.feed !== result.feed) throw new Error('Raw and adjusted owner outcome feeds differ')
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
      const economicEvaluations = {data: aging ? (thesisEvaluations.data ?? []).filter(e => e.recommendation_id === row.data.id) : []}
      const evaluatorVersion = aging ? String(task.evaluator_version ?? 'calendar-aging-v1') : FORECAST_REVIEW_POLICY
      const content = {
        ...markout,
        ...(aging ? { checkpoint: task.horizon, checkpointDate: anniversary, evaluatedSession: endpoint, scheduleRetrospective: task.retrospective === true, evaluatorVersion: task.evaluator_version ?? 'calendar-aging-v1', exposureSemantics: agingSemantics(rec.action), frozenQuantity: name.quantity, frozenWeightPct: name.currentWeightPct, economicForecastEvaluations: economicEvaluations?.data ?? [], forecastStatus: 'Economic claims are resolved independently by thesis tasks; price performance cannot resolve them', attributionLimits: ['Hypothetical returns are not reported execution', 'Broker position changes are not fill evidence', 'Missing observations remain unresolved'] } : {}),
        policy: {
          ...policy,
          benchmark: policy.benchmark,
          execution: 'next session strictly after publication, at open',
          adjustment:
            'all: provider split/dividend adjustment; no dividends added again',
          costBps: 20,
          feed: result.feed,
          evaluator: evaluatorVersion,
        },
        identityGaps: identities.gaps,
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
        aging ? 'aging' : 'markout',
        task.horizon,
        content,
        now,
        evaluatorVersion,
      )
      if (markout.status !== 'resolved') throw new Error(markout.reason)
      if (aging && agingSemantics(rec.action) === 'descriptive') {
        const updated = await db.from('recommendation_evaluation_tasks').update({status: 'complete', last_checked_at: now.toISOString(), error: null}).eq('id', task.id)
        if (updated.error) throw new Error(updated.error.message)
        complete++
        continue
      }
      const target =
        rec.entry.targetWeightPct === null
          ? null
          : rec.entry.targetWeightPct / 100
      const attribution = attributeDecision({
        selectionReturn: markout.grossReturn,
        benchmarkReturn: markout.benchmarkReturn,
        timedReturn: entryRule.return,
        baselineWeight: aging && name.owned && name.currentWeightPct !== null ? name.currentWeightPct / 100 : policy.baselineWeight,
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
        evaluatorVersion,
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
    value = typeof input.observedValue === 'number' ? input.observedValue : NaN
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
.select('*,recommendation_versions!inner(content,issued_at)')
    .eq('id', id)
    .eq('owner_id', ownerId)
    .single()
  if (forecast.error) throw new Error('Forecast not found for owner')
  if (!forecastsAreApproved(record(forecast.data.recommendation_versions).content))
    throw new Error('This forecast was withheld by decision review and cannot be resolved or scored')
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
  const f = record(forecast.data.content)
  if (!f.observationPeriod || !f.unit || !f.resolutionSource) throw new Error('Legacy forecast has no frozen period, unit or resolution source; retain it as unresolved')
  if (input.observationPeriod !== f.observationPeriod || input.unit !== f.unit || input.resolutionSource !== f.resolutionSource || evidence.some(e => Date.parse(String(e.availableAt)) <= Date.parse(String(record(forecast.data.recommendation_versions).issued_at)))) throw new Error('Owner observation must match the frozen period, unit and resolution source and become available after issuance')
  const outcome =
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
      forecast: f,
      observationPeriod: input.observationPeriod, unit: input.unit, resolutionSource: input.resolutionSource,
      attribution: 'Owner-attested metric and source; not a model-created label',
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
  const approved = forecasts.filter(f => forecastsAreApproved(recommendations.find(r => r.id === f.recommendation_id)?.content))
  const observations = approved
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
        category: forecastCategory({metric: String(record(f.content).metric ?? '')}),
        episodeId: economicEpisodeKey(String(r?.security_id), record(f.content) as unknown as import('../markets/recommendations.ts').Forecast) ?? `unresolvable:${f.id}`,
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
    calibration: calibration(observations.filter(o => o.category === 'economic' && !o.episodeId.startsWith('unresolvable:'))),
    marketReturnCalibration: calibration(observations.filter(o => o.category === 'market_return')),
    forecastReview: {policy: FORECAST_REVIEW_POLICY, total: forecasts.length, eligible: approved.length, excluded: forecasts.length - approved.length, unresolvable: observations.filter(o=>o.episodeId.startsWith('unresolvable:') && o.category==='economic').length},
    resolutionPolicy: EVALUATOR,
    dependence: 'Economic episode counts remove reiterated questions; issuer and cross-issuer correlations remain. These descriptive counts are not proof of independent efficacy.',
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
        'Cluster economic observations across portfolios, thresholds and reiterations; issuer/macro dependence still limits effective sample size',
        'No retrospective latest-context backtest',
        'No automatic policy or thesis changes',
      ],
    },
  }
  const key = now.toISOString().slice(0, 10)
  const saved = await db.from('recommendation_cohort_reviews').insert({
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
