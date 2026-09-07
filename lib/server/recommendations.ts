import { createHash, randomUUID } from 'node:crypto'
import { getSupabaseClient } from './supabase.ts'
import { fetchAuthoritativePortfolios } from './portfolio.ts'
import { runCodexJson } from './codex-exec.ts'
import { MARKETS_OWNER_ID } from '../auth/markets-auth.ts'
import {
  RECOMMENDATION_POLICY,
  abstention,
  validateBatch,
  type DecisionContext,
  type DecisionName,
  type EvidenceRef,
  type Recommendation,
} from '../markets/recommendations.ts'

type Row = Record<string, unknown>
export const record = (v: unknown): Row =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {}
export function contentHash(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')
}
export function investmentDate(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}
export function investmentDb() {
  const db = getSupabaseClient()
  if (!db) throw new Error('Supabase unavailable')
  return db
}

async function rows(
  table: string,
  ownerId?: string,
  cutoff?: string,
  dateColumn = 'generated_at',
  limit = 300,
): Promise<Row[]> {
  const accumulated: Row[] = []
  const pageSize = Math.min(limit, 500)
  for (let offset = 0; ; offset += pageSize) {
    let q = investmentDb()
      .from(table)
      .select('*')
      .order(dateColumn, { ascending: false })
      .order('id')
      .range(offset, offset + pageSize - 1)
    if (ownerId) q = q.eq('owner_id', ownerId)
    if (cutoff) q = q.lte(dateColumn, cutoff)
    const result = await q
    if (result.error) throw new Error(`${table}: ${result.error.message}`)
    accumulated.push(...result.data)
    // Owner research/thesis history is complete. Deliberately bounded market
    // and World context has an explicit manifest scope, not a coverage claim.
    if (result.data.length < pageSize || !ownerId) break
    if (accumulated.length >= 10000)
      throw new Error(
        `${table}: history exceeds supported daily context; paginate by required securities`,
      )
  }
  return accumulated
}

/** Freeze once, then reuse on every retry. Retrieval time is never relabeled as
 * the publisher's timestamp. Unknown availability explicitly restricts action. */
export async function assembleDecisionContext(
  ownerId = MARKETS_OWNER_ID,
  now = new Date(),
): Promise<DecisionContext> {
  const db = investmentDb(),
    date = investmentDate(now)
  const existing = await db
    .from('recommendation_input_manifests')
    .select('content')
    .eq('owner_id', ownerId)
    .eq('decision_date', date)
    .eq('policy_version', RECOMMENDATION_POLICY)
    .maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) return existing.data.content as DecisionContext
  const cutoff = now.toISOString(),
    gaps: string[] = [],
    evidence: EvidenceRef[] = []
  const portfolio = await fetchAuthoritativePortfolios(ownerId)
  if (!portfolio.length)
    throw new Error(
      'No authoritative portfolio exists; cannot invent daily coverage',
    )
  const optional = async (label: string, request: Promise<Row[]>) =>
    request.catch((e) => {
      gaps.push(
        `${label} unavailable: ${e instanceof Error ? e.message.slice(0, 120) : 'read failure'}`,
      )
      return []
    })
  const [research, theses, packets, world, market, candidates, watches, macro] =
    await Promise.all([
      optional('Research', rows('equity_research_notes', ownerId, cutoff)),
      optional(
        'Theses',
        rows('investment_theses', ownerId, cutoff, 'created_at'),
      ),
      optional('Company packets', rows('company_packets', ownerId, cutoff)),
      optional(
        'World causal model',
        rows('causal_model_versions', undefined, cutoff, 'as_of', 80),
      ),
      optional(
        'Market snapshots',
        rows('market_snapshots', undefined, cutoff, 'created_at', 10),
      ),
      optional(
        'Candidate discovery',
        rows('candidate_briefs', undefined, cutoff, 'generated_at', 100),
      ),
      optional(
        'Watchlists',
        (async () => {
          const res = await db
            .from('market_watchlists')
            .select('id,market_watchlist_items(symbol)')
            .eq('owner_id', ownerId)
          if (res.error) throw new Error(res.error.message)
          return res.data ?? []
        })(),
      ),
      optional(
        'Macro vintages',
        rows('investment_macro_vintages', undefined, cutoff, 'observed_at', 60),
      ),
    ])
  const snapshot = market.find((m) => m.status === 'complete')
  const watched = new Set(
    watches.flatMap((w) =>
      (Array.isArray(w.market_watchlist_items)
        ? w.market_watchlist_items
        : []
      ).map((i) => String(record(i).symbol)),
    ),
  )
  const owned = new Set(
    portfolio.flatMap((p) => p.holdings.map((h) => h.symbol)),
  )
  const selected = new Set([...owned, ...watched])
  const universe = [
    ...new Set([...selected, ...candidates.map((c) => String(c.symbol))]),
  ].map((symbol) => ({
    symbol,
    selected: selected.has(symbol),
    reason: owned.has(symbol)
      ? 'Current authoritative holding'
      : watched.has(symbol)
        ? 'Owner watchlist'
        : 'Discovery candidate; not selected for current portfolio batch',
  }))
  const addEvidence = (
    id: string,
    kind: string,
    value: unknown,
    asOf: unknown,
    availableAt: unknown,
    url: unknown = null,
    feed: unknown = null,
  ) => {
    if (!evidence.some((e) => e.id === id))
      evidence.push({
        id,
        kind,
        value,
        asOf: typeof asOf === 'string' ? asOf : null,
        availableAt: typeof availableAt === 'string' ? availableAt : cutoff,
        retrievedAt: cutoff,
        url: typeof url === 'string' ? url : null,
        feed: typeof feed === 'string' ? feed : null,
        hash: contentHash(value),
      })
    return id
  }
  for (const m of macro)
    addEvidence(
      `macro:${m.id}`,
      'macro_vintage',
      m.content,
      null,
      m.observed_at,
    )
  if (!macro.length) gaps.push('No captured macro indicator vintages')
  for (const w of world)
    addEvidence(
      `causal:${w.id}`,
      'causal_model',
      w,
      w.as_of,
      w.created_at ?? cutoff,
    )
  if (!world.length) gaps.push('No governed World/industry context available')
  if (snapshot)
    addEvidence(
      `market:${snapshot.id}`,
      'market_snapshot',
      snapshot,
      snapshot.data_as_of,
      snapshot.created_at,
      null,
      snapshot.feed,
    )
  else gaps.push('No complete market snapshot')
  const quotes = new Map<string, Row>(),
    assets = new Map<string, Row>()
  for (const symbols of [...selected].reduce<string[][]>((a, s, i) => {
    if (i % 100 === 0) a.push([])
    a.at(-1)!.push(s)
    return a
  }, [])) {
    const [q, a] = await Promise.all([
      snapshot
        ? db
            .from('screener_rows')
            .select('*')
            .eq('snapshot_id', snapshot.id)
            .in('symbol', symbols)
        : Promise.resolve({ data: [], error: null }),
      db.from('market_assets').select('*').in('symbol', symbols),
    ])
    if (q.error || a.error)
      throw new Error(q.error?.message ?? a.error?.message)
    for (const row of q.data ?? []) quotes.set(row.symbol, row)
    for (const row of a.data ?? []) assets.set(row.symbol, row)
  }
  const names: DecisionName[] = []
  for (const p of portfolio) {
    const portfolioId = p.account.id
    addEvidence(`portfolio:${portfolioId}`, 'portfolio', p, p.dataAsOf, cutoff)
    const symbols = new Set([...p.holdings.map((h) => h.symbol), ...watched])
    const valuation = p.holdings.map(
      (h) =>
        h.currentValue ??
        (quotes.has(h.symbol)
          ? Number(quotes.get(h.symbol)!.price) * h.quantity
          : null),
    )
    const total =
      p.totalValue ??
      (valuation.every((v) => v !== null)
        ? p.cashBalance +
          valuation.reduce<number>((sum, v) => sum + (v ?? 0), 0)
        : null)
    for (const symbol of symbols) {
      const h = p.holdings.find((h) => h.symbol === symbol),
        q = quotes.get(symbol),
        asset = assets.get(symbol)
      const note =
        research.find((r) => r.symbol === symbol && r.status === 'complete') ??
        null
      const packet = packets.find((r) => r.id === note?.company_packet_id),
        packetContent = record(packet?.packet)
      const thesis =
        theses.find(
          (t) =>
            t.symbol === symbol &&
            ['accepted', 'invalidated'].includes(String(t.status)),
        ) ?? null
      const price =
        q && Number(q.price) > 0
          ? {
              price: Number(q.price),
              asOf: String(q.data_as_of),
              feed: String(snapshot?.feed ?? q.feed ?? 'unknown'),
            }
          : null
      const sourceIds = [`portfolio:${portfolioId}`]
      if (q)
        sourceIds.push(
          addEvidence(
            `quote:${snapshot?.id}:${symbol}`,
            'price',
            q,
            q.data_as_of,
            snapshot?.created_at,
            null,
            snapshot?.feed,
          ),
        )
      if (note)
        sourceIds.push(
          addEvidence(
            `research:${note.id}`,
            'research',
            note,
            note.data_as_of,
            note.generated_at,
          ),
        )
      if (packet)
        sourceIds.push(
          addEvidence(
            `packet:${packet.id}`,
            'company_packet',
            packet,
            packet.data_as_of,
            packet.generated_at,
          ),
        )
      if (thesis)
        sourceIds.push(
          addEvidence(
            `thesis:${thesis.id}`,
            'thesis',
            thesis,
            thesis.updated_at ?? thesis.created_at,
            cutoff,
          ),
        )
      const quality = record(packetContent.evidenceQuality)
      const nameGaps: string[] = []
      if (
        thesis?.updated_at &&
        Date.parse(String(thesis.updated_at)) > Date.parse(cutoff)
      )
        nameGaps.push('Thesis changed after the decision cutoff')
      if (!asset?.alpaca_id)
        nameGaps.push('Stable security identity is unavailable')
      if (
        !note ||
        !Number.isFinite(Date.parse(String(note.generated_at))) ||
        Date.parse(cutoff) - Date.parse(String(note.generated_at)) >
          35 * 86400000
      )
        nameGaps.push('Research missing or older than 35 days')
      if (!quality.checkedAt)
        nameGaps.push('Research predates evidence-quality validation')
      if (Array.isArray(quality.missing))
        nameGaps.push(
          ...quality.missing.map((g) => `Missing company evidence: ${g}`),
        )
      if (
        p.dataSource !== 'robinhood' ||
        !p.dataAsOf ||
        !Number.isFinite(Date.parse(p.dataAsOf)) ||
        Date.parse(p.dataAsOf) > Date.parse(cutoff) ||
        Date.parse(cutoff) - Date.parse(p.dataAsOf) > 96 * 3600000
      )
        nameGaps.push('Current portfolio capture needs verification')
      const liquidityResult = await db
        .from('market_bars_daily')
        .select('close,volume,trading_date')
        .eq('symbol', symbol)
        .eq('feed', price?.feed ?? 'unknown')
        .lt('trading_date', cutoff.slice(0, 10))
        .order('trading_date', { ascending: false })
        .limit(20)
      if (liquidityResult.error)
        nameGaps.push('Liquidity observations unavailable')
      const liquidity = liquidityResult.data ?? []
      const averageDollarVolume =
        liquidity.length === 20
          ? liquidity.reduce(
              (sum, b) => sum + Number(b.close) * Number(b.volume),
              0,
            ) / 20
          : null
      const sector =
        typeof record(packetContent.company).sector === 'string'
          ? String(record(packetContent.company).sector)
          : null
      const peers = Array.isArray(packetContent.peers)
        ? packetContent.peers
            .filter(
              (p): p is string =>
                typeof p === 'string' &&
                /^[A-Z][A-Z0-9.-]{0,11}$/.test(p) &&
                p !== symbol,
            )
            .slice(0, 5)
        : []
      if (liquidity.length)
        sourceIds.push(
          addEvidence(
            `liquidity:${symbol}`,
            'trailing_20_session_liquidity',
            liquidity,
            liquidity[0]?.trading_date,
            cutoff,
            null,
            price?.feed,
          ),
        )
      const causalLinks = world
        .filter((w) =>
          JSON.stringify(w.structured_content).includes(`"${symbol}"`),
        )
        .map((w) => `causal:${w.id}`)
      names.push({
        symbol,
        sector,
        averageDollarVolume,
        evaluationPolicy: {
          benchmark: 'SPY',
          peers,
          peerSelection:
            'CompanyPacket peers fixed at issuance; sector/company comparables, not a factor-matched portfolio',
          costBps: 20,
          baselineWeight: 0.05,
          execution: 'next_session_open',
        },
        securityId: String(asset?.alpaca_id ?? `unresolved:${symbol}`),
        portfolioId,
        owned: Boolean(h && h.quantity > 0),
        quantity: h?.quantity ?? 0,
        currentWeightPct:
          total && (h?.currentValue != null || price || !h)
            ? ((h ? (h.currentValue ?? h.quantity * price!.price) : 0) /
                total) *
              100
            : null,
        portfolioValue: total,
        cash: p.cashBalance,
        quote: price,
        research: note,
        thesis,
        sources: [...sourceIds, ...causalLinks],
        gaps: nameGaps,
        causalLinks,
        selectionReason: h
          ? 'Owned: required daily coverage'
          : 'Owner watchlist',
      })
    }
  }
  if (snapshot) {
    for (let offset = 0; ; offset += 500) {
      const eligible = await db
        .from('screener_rows')
        .select('symbol')
        .eq('snapshot_id', snapshot.id)
        .order('symbol')
        .range(offset, offset + 499)
      if (eligible.error) throw new Error(eligible.error.message)
      for (const row of eligible.data ?? [])
        if (!universe.some((n) => n.symbol === row.symbol))
          universe.push({
            symbol: row.symbol,
            selected: false,
            reason:
              'Eligible screener member; outside initial owner portfolio/watchlist batch',
          })
      if ((eligible.data?.length ?? 0) < 500) break
    }
  }
  const context: DecisionContext = {
    id: randomUUID(),
    ownerId,
    date,
    cutoff,
    policy: RECOMMENDATION_POLICY,
    codeVersion:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.STRATUM_RELEASE_SHA ??
      'unreported',
    portfolio,
    names,
    evidence,
    world,
    market: snapshot ?? null,
    gaps,
    universe,
  }
  // Bounded reads must never quietly truncate an actionable context.
  const insert = await db.from('recommendation_input_manifests').insert({
    id: context.id,
    owner_id: ownerId,
    decision_date: date,
    decision_cutoff: cutoff,
    policy_version: context.policy,
    content_hash: contentHash(context),
    content: context,
  })
  if (insert.error?.code === '23505')
    return assembleDecisionContext(ownerId, now)
  if (insert.error) throw new Error(insert.error.message)
  return context
}

export async function generateDailyRecommendations(
  ownerId = MARKETS_OWNER_ID,
  now = new Date(),
) {
  const db = investmentDb(),
    context = await assembleDecisionContext(ownerId, now)
  const prior = await db
    .from('recommendation_batches')
    .select('id')
    .eq('manifest_id', context.id)
    .maybeSingle()
  if (prior.error) throw new Error(prior.error.message)
  if (prior.data) return { batchId: prior.data.id, reused: true }
  let recommendations: Recommendation[],
    metadata: unknown = {
      provider: 'deterministic',
      reason: 'insufficient evidence',
    }
  let summary =
    'Daily evaluation is incomplete. Review the stated gaps before changing capital.'
  // Do not spend model time pretending a completely blocked context is decision-ready.
  if (context.gaps.length || context.names.every((n) => n.gaps.length > 0)) {
    recommendations = context.names.map((n) =>
      abstention(
        n,
        context,
        [...context.gaps, ...n.gaps].join('; ') || 'Evidence is incomplete',
      ),
    )
  } else {
    const generated = await runCodexJson({
      schemaPath: 'schemas/daily-recommendations.schema.json',
      webSearch: false,
      timeoutMs: 15 * 60 * 1000,
      prompt: `Generate owner-facing investment recommendations using only the frozen context below. Do not fetch data, inspect external files, or execute orders. Cover every (portfolioId,symbol) exactly once. Research rating is separate from entry timing and portfolio fit. No-trade means evaluation/entry abstention, hold is affirmative. New risk requires accepted thesis and fresh evidence. Risk reductions may follow invalidation without a new bullish thesis. Compare an alternative and a counter-thesis. Include specific observable, probabilistic economic forecasts with deadlines, source IDs and falsifiers; narrative confidence is not a calibrated probability. Maximum new position is 10%; do not invent prices or sizing. Choose entry.trigger explicitly: next_session_open, next_open_below_ceiling, or manual_condition. Any additional untestable condition requires manual_condition. Conditional entries expire at expiresAt and are not assumed filled. Use gaps to abstain rather than silently assuming facts. Respond with summary and recommendations.\n${JSON.stringify(context)}`,
      validate: (value) => {
        const v = record(value)
        return {
          summary: String(v.summary ?? ''),
          recommendations: validateBatch(v.recommendations, context),
        }
      },
    })
    const critic = await runCodexJson({
      schemaPath: 'schemas/recommendation-critic.schema.json',
      webSearch: false,
      timeoutMs: 8 * 60 * 1000,
      prompt: `Independently criticize these proposed decisions against the frozen evidence. Flag any unsupported economic link, overlooked contrary evidence, misleading timestamp, stale data, invalid sizing or invented factual claim. Identify blocking problems by portfolioId and symbol. Do not change the original thesis or fetch new information.\nCONTEXT ${JSON.stringify(context)}\nDECISIONS ${JSON.stringify(generated.data)}`,
      validate: (value) => {
        const v = record(value)
        if (!Array.isArray(v.blocks)) throw new Error('Invalid critic')
        return v.blocks.map((b) => {
          const x = record(b)
          if (
            !context.names.some(
              (n) => n.symbol === x.symbol && n.portfolioId === x.portfolioId,
            ) ||
            !String(x.reason ?? '').trim()
          )
            throw new Error('Invalid critic target')
          return x
        })
      },
    })
    recommendations = generated.data.recommendations.map((r) => {
      const block = critic.data.find(
        (b) => b.symbol === r.symbol && b.portfolioId === r.portfolioId,
      )
      return block
        ? {
            ...r,
            proposedAction: r.action,
            action: 'no_trade' as const,
            entry: { ...r.entry, targetWeightPct: null },
            reason: `Independent review blocked action: ${block.reason}`,
            gateReasons: [...r.gateReasons, String(block.reason)],
          }
        : r
    })
    metadata = {
      generator: generated.metadata,
      critic: critic.metadata,
      criticBlocks: critic.data,
    }
    summary = recommendations.some((r) => r.gateReasons.length)
      ? `${recommendations.filter((r) => r.gateReasons.length).length} proposed decisions were blocked by evidence or portfolio checks. Review each final action and its reasons before changing capital.`
      : generated.data.summary
  }
  const result = await db.rpc('publish_recommendation_batch', {
    p_manifest_id: context.id,
    p_recommendations: recommendations,
    p_metadata: metadata,
    p_summary: summary,
  })
  if (result.error) throw new Error(result.error.message)
  return {
    batchId: String(result.data),
    count: recommendations.length,
    abstentions: recommendations.filter((r) => r.action === 'no_trade').length,
  }
}

export async function fetchRecommendationWorkspace(ownerId: string) {
  const db = investmentDb()
  const viewedAt = new Date().toISOString()
  const batches = await db
    .from('recommendation_batches')
    .select('*')
    .eq('owner_id', ownerId)
    .order('published_at', { ascending: false })
    .limit(14)
  if (batches.error) throw new Error(batches.error.message)
  const latest = batches.data?.[0] ?? null
  if (!latest)
    return {
      viewedAt,
      batches: [],
      latest: null,
      recommendations: [],
      events: [],
      evaluations: [],
      context: null,
      delivery: null,
      cohorts: [],
      forecasts: [],
      experiments: [],
    }
  const responses = await Promise.all([
    db
      .from('recommendation_versions')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('batch_id', latest.id)
      .order('symbol'),
    db
      .from('recommendation_owner_events')
      .select('*')
      .eq('owner_id', ownerId)
      .order('recorded_at', { ascending: false })
      .limit(100),
    db
      .from('recommendation_evaluations')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('recommendation_input_manifests')
      .select('content,content_hash')
      .eq('id', latest.manifest_id)
      .eq('owner_id', ownerId)
      .single(),
    db
      .from('investment_newsletter_outbox')
      .select(
        'id,edition_date,investment_newsletter_delivery(status,last_attempt_at,error)',
      )
      .eq('owner_id', ownerId)
      .order('edition_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('recommendation_cohort_reviews')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(4),
    db
      .from('recommendation_forecasts')
      .select('*')
      .eq('owner_id', ownerId)
      .order('deadline')
      .limit(100),
    db
      .from('recommendation_policy_experiments')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(30),
  ])
  for (const r of responses) if (r.error) throw new Error(r.error.message)
  return {
    viewedAt,
    batches: batches.data,
    latest,
    recommendations: responses[0].data ?? [],
    events: responses[1].data ?? [],
    evaluations: responses[2].data ?? [],
    context: responses[3].data,
    delivery: responses[4].data,
    cohorts: responses[5].data ?? [],
    forecasts: responses[6].data ?? [],
    experiments: responses[7].data ?? [],
  }
}

export async function recordRecommendationOwnerEvent(
  ownerId: string,
  input: Row,
) {
  const db = investmentDb(),
    event = String(input.eventType ?? ''),
    id = String(input.recommendationId ?? ''),
    requestId = String(input.requestId ?? '')
  if (
    ![
      'acknowledged',
      'accepted',
      'rejected',
      'delayed',
      'modified',
      'manually_executed',
      'cancelled',
      'correction',
    ].includes(event) ||
    String(input.rationale ?? '').trim().length < 3 ||
    !/^[0-9a-f-]{36}$/i.test(requestId)
  )
    throw new Error('Valid event, rationale and request ID required')
  const recommendation = await db
    .from('recommendation_versions')
    .select('id,issued_at')
    .eq('id', id)
    .eq('owner_id', ownerId)
    .single()
  if (recommendation.error)
    throw new Error('Recommendation does not belong to this owner')
  const occurredAt =
    typeof input.occurredAt === 'string'
      ? input.occurredAt
      : new Date().toISOString()
  if (
    !Number.isFinite(Date.parse(occurredAt)) ||
    Date.parse(occurredAt) > Date.now() + 60000
  )
    throw new Error('Invalid event time')
  if (Date.parse(occurredAt) < Date.parse(recommendation.data.issued_at))
    throw new Error('Owner outcome cannot precede recommendation publication')
  const details = record(input.details)
  if (event === 'correction') {
    const previous = await db
      .from('recommendation_owner_events')
      .select('id')
      .eq('id', String(details.supersedesEventId ?? ''))
      .eq('owner_id', ownerId)
      .eq('recommendation_id', id)
      .single()
    if (previous.error)
      throw new Error(
        'Correction must reference an existing event for this recommendation',
      )
  }
  // Transaction links must be reconciled independently; arbitrary IDs are not broker evidence.
  if (details.transactionId)
    throw new Error(
      'Record the actual fill here; transaction linking requires separate reconciliation',
    )
  if (
    event === 'manually_executed' &&
    (!(Number(details.quantity) > 0) ||
      !(Number(details.price) > 0) ||
      !['buy', 'sell'].includes(String(details.side)))
  )
    throw new Error(
      'Manual execution requires side, actual quantity and fill price',
    )
  const result = await db
    .from('recommendation_owner_events')
    .insert({
      owner_id: ownerId,
      recommendation_id: id,
      request_id: requestId,
      event_type: event,
      rationale: String(input.rationale).slice(0, 4000),
      details,
      occurred_at: occurredAt,
    })
    .select('id')
    .single()
  if (result.error?.code === '23505') {
    const prior = await db
      .from('recommendation_owner_events')
      .select('id,recommendation_id,event_type')
      .eq('owner_id', ownerId)
      .eq('request_id', requestId)
      .single()
    if (
      prior.error ||
      prior.data.recommendation_id !== id ||
      prior.data.event_type !== event
    )
      throw new Error('Idempotency key belongs to a different owner event')
    await refreshOutcomeTasks()
    return { id: prior.data.id, reused: true }
  }
  if (result.error) throw new Error(result.error.message)
  await refreshOutcomeTasks()
  return result.data
  async function refreshOutcomeTasks() {
    if (!['manually_executed', 'correction'].includes(event)) return
    const refreshed = await db
      .from('recommendation_evaluation_tasks')
      .update({
        status: 'needs_data',
        not_before: new Date().toISOString(),
        error: 'Owner outcome changed; append revised attribution',
      })
      .eq('recommendation_id', id)
      .eq('kind', 'markout')
    if (refreshed.error) throw new Error(refreshed.error.message)
  }
}
