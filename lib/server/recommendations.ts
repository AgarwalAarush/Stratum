import { recommendationDisplayContext } from '../markets/recommendation-display.ts'
import { admitDiscoveryCandidates, hasValidatedSystemThesis } from '../markets/decision-admission.ts'
import { createHash, randomUUID } from 'node:crypto'
import { getSupabaseClient } from './supabase.ts'
import { fetchAuthoritativePortfolios } from './portfolio.ts'
import { runCodexJson } from './codex-exec.ts'
import { withDecisionInputs } from './decision-inputs.ts'
import { resolve } from 'node:path'
import { MARKETS_OWNER_ID } from '../auth/markets-auth.ts'
import {
  RECOMMENDATION_POLICY,
  abstention,
  validateGeneratedBatch,
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

/** Load exact immutable versions referenced by the selected notes, not every
 * historical packet (which can be hundreds of megabytes of source evidence). */
export async function loadDecisionPackets(table: 'company_packets' | 'etf_research_packets', ownerId: string, cutoff: string, packetIds: string[]): Promise<Row[]> {
  const ids = [...new Set(packetIds)], result: Row[] = []
  for (let i = 0; i < ids.length; i += 5) {
    const response = await investmentDb().from(table).select('*')
      .eq('owner_id', ownerId).in('id', ids.slice(i,i+5)).lte('generated_at', cutoff)
      .abortSignal(AbortSignal.timeout(20_000))
    if (response.error) throw new Error(`${table}: ${response.error.message}`)
    result.push(...response.data)
  }
  return result
}

/** Freeze once, then reuse on every retry. Retrieval time is never relabeled as
 * the publisher's timestamp. Unknown availability explicitly restricts action. */
export async function assembleDecisionContext(
  ownerId = MARKETS_OWNER_ID,
  now = new Date(),
  editionKey = 'daily',
): Promise<DecisionContext> {
  const db = investmentDb(),
    date = investmentDate(now)
  const existing = await db
    .from('recommendation_input_manifests')
    .select('content')
    .eq('owner_id', ownerId)
    .eq('decision_date', date)
    .eq('policy_version', RECOMMENDATION_POLICY)
    .eq('edition_key', editionKey)
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
  const [research, theses, world, market, candidates, watches, macro, fundResearch] =
    await Promise.all([
      optional('Research', rows('equity_research_notes', ownerId, cutoff)),
      optional(
        'Theses',
        rows('investment_theses', ownerId, cutoff, 'generated_at'),
      ),
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
      optional('ETF research', rows('etf_research_notes', ownerId, cutoff)),
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
  const admitted = admitDiscoveryCandidates(candidates.filter(c => !c.owner_id || c.owner_id === ownerId), selected, cutoff)
  for (const c of admitted) selected.add(String(c.symbol))
  const selectedNotes = [...selected].flatMap(symbol => {
    const note = [...research,...fundResearch].filter(r => r.symbol === symbol && r.status === 'complete')
      .sort((a,b) => String(b.generated_at).localeCompare(String(a.generated_at)))[0]
    return note ? [note] : []
  })
  const [packets,fundPackets] = await Promise.all([
    optional('Company packets', loadDecisionPackets('company_packets',ownerId,cutoff,selectedNotes.flatMap(n => typeof n.company_packet_id === 'string' ? [n.company_packet_id] : []))),
    optional('ETF packets', loadDecisionPackets('etf_research_packets',ownerId,cutoff,selectedNotes.flatMap(n => typeof n.etf_research_packet_id === 'string' ? [n.etf_research_packet_id] : []))),
  ])
  const universe = [
    ...new Set([...selected, ...candidates.map((c) => String(c.symbol))]),
  ].map((symbol) => ({
    symbol,
    selected: selected.has(symbol),
    reason: owned.has(symbol)
      ? 'Current authoritative holding'
      : watched.has(symbol)
        ? 'Owner watchlist'
        : selected.has(symbol) ? 'Scout discovery admitted for investigation; screening is not a buy signal' : 'Discovery candidate outside the bounded daily admission',
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
    const symbols = new Set([...p.holdings.map((h) => h.symbol), ...watched, ...admitted.map(c => String(c.symbol))])
    const valuation = p.holdings.map(
      (h) =>
        h.currentValue ??
        (quotes.has(h.symbol)
          ? Number(quotes.get(h.symbol)!.price) * h.quantity
          : null),
    )
    // An owner allocation budget is the sizing denominator even when a held
    // instrument has no current quote. That instrument still fails its own price gate.
    const total =
      p.allocationBudget?.total ?? p.totalValue ??
      (valuation.every((v) => v !== null)
        ? p.cashBalance +
          valuation.reduce<number>((sum, v) => sum + (v ?? 0), 0)
        : null)
    for (const symbol of symbols) {
      const h = p.holdings.find((h) => h.symbol === symbol),
        q = quotes.get(symbol),
        asset = assets.get(symbol)
      const note =
        [...research, ...fundResearch].filter(r => r.symbol === symbol && r.status === 'complete').sort((a,b) => String(b.generated_at).localeCompare(String(a.generated_at)))[0] ??
        null
      const isFund = Boolean(note?.etf_research_packet_id) || /\b(?:ETF|exchange[- ]traded fund)\b/i.test(String(asset?.name ?? ''))
      const packet = [...packets, ...fundPackets].find((r) => r.id === (note?.company_packet_id ?? note?.etf_research_packet_id)),
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
            isFund ? 'etf_packet' : 'company_packet',
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
            thesis.data_as_of,
            thesis.reviewed_at ?? thesis.generated_at,
          ),
        )
      const quality = record(packetContent.evidenceQuality)
      const nameGaps: string[] = []
      if (
        thesis?.reviewed_at &&
        Date.parse(String(thesis.reviewed_at)) > Date.parse(cutoff)
      )
        nameGaps.push('Thesis review occurred after the decision cutoff')
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
      const limitations = Array.isArray(quality.missing) ? quality.missing.map(String) : []
      nameGaps.push(...limitations.filter(g => !['earnings transcripts','consensus estimates'].includes(g)).map(g => `Missing ${isFund ? 'fund' : 'company'} evidence: ${g}`))
      if (isFund && (!Number.isFinite(Date.parse(String(packet?.data_as_of))) || Date.parse(cutoff) - Date.parse(String(packet?.data_as_of)) > 7 * 86400000)) nameGaps.push('ETF holdings are older than seven days or undated')
      const systemThesisValidated = thesis?.status !== 'invalidated' && hasValidatedSystemThesis(note, quality, cutoff)
      if (
        !['robinhood', 'manual_snapshot'].includes(p.dataSource) ||
        (p.confirmedAt !== undefined && Date.parse(p.confirmedAt) > Date.parse(cutoff)) ||
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
        isFund ? (symbol === 'XLU' || symbol === 'UTES' ? 'Utilities' : symbol === 'XLK' ? 'Technology' : null) : typeof record(packetContent.company).sector === 'string'
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
          benchmark: isFund && symbol === 'UTES' ? 'XLU' : 'SPY',
          peers,
          peerSelection:
            isFund ? 'Broad equity benchmark; no verified fund peer cohort is available. Not a factor-matched attribution.' : 'CompanyPacket peers fixed at issuance; sector/company comparables, not a factor-matched portfolio',
          costBps: 20,
          baselineWeight: 0.05,
          execution: 'next_session_open',
        },
        securityId: String(asset?.alpaca_id ?? `unresolved:${symbol}`),
        portfolioId,
        portfolioName: p.account.name,
        instrumentType: isFund ? 'etf' : 'equity',
        systemThesisValidated,
        limitations,
        entryGaps: !Number.isFinite(Date.parse(String(quality.priceAsOf))) || Date.parse(cutoff) - Date.parse(String(quality.priceAsOf)) > 96 * 3600000 ? ['Research entry assumptions use stale price evidence; refresh research'] : [],
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
        capitalBasis: p.allocationBudget ? 'owner_budget' : 'broker_cash',
        quote: price,
        research: note,
        thesis,
        sources: [...sourceIds, ...causalLinks],
        gaps: nameGaps,
        causalLinks,
        selectionReason: h
          ? 'Owned: required daily coverage'
          : watched.has(symbol) ? 'Owner watchlist' : 'Scout discovery: investigate before allocating capital',
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
  const comparisonSymbols = [
    ...new Set(
      names.flatMap((n) => [
        n.symbol,
        n.evaluationPolicy!.benchmark,
        ...n.evaluationPolicy!.peers,
      ]),
    ),
  ]
  const securityIds: Record<string, string> = {}
  for (let offset = 0; offset < comparisonSymbols.length; offset += 100) {
    const identities = await db
      .from('market_assets')
      .select('symbol,alpaca_id,source_as_of')
      .in('symbol', comparisonSymbols.slice(offset, offset + 100))
    if (identities.error) throw new Error(identities.error.message)
    for (const asset of identities.data ?? [])
      if (asset.alpaca_id) securityIds[asset.symbol] = String(asset.alpaca_id)
  }
  for (const name of names)
    name.evaluationPolicy!.securityIds = Object.fromEntries(
      [
        name.symbol,
        name.evaluationPolicy!.benchmark,
        ...name.evaluationPolicy!.peers,
      ]
        .filter((symbol) => securityIds[symbol])
        .map((symbol) => [symbol, securityIds[symbol]]),
    )
  const context: DecisionContext = {
    id: randomUUID(),
    ownerId,
    date,
    cutoff,
    policy: RECOMMENDATION_POLICY,
    editionKey,
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
    edition_key: editionKey,
    content_hash: contentHash(context),
    content: context,
  })
  if (insert.error?.code === '23505')
    return assembleDecisionContext(ownerId, now, editionKey)
  if (insert.error) throw new Error(insert.error.message)
  return context
}

export async function generateDailyRecommendations(
  ownerId = MARKETS_OWNER_ID,
  now = new Date(),
  editionKey = 'daily',
) {
  const db = investmentDb(),
    context = await assembleDecisionContext(ownerId, now, editionKey)
  const prior = await db
    .from('recommendation_batches')
    .select('id')
    .eq('manifest_id', context.id)
    .maybeSingle()
  if (prior.error) throw new Error(prior.error.message)
  if (prior.data) return { batchId: prior.data.id, reused: true }
  let recommendations: Recommendation[] = [],
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
    await withDecisionInputs(context, async (input) => {
      const generated = await runCodexJson({
        schemaPath: resolve('schemas/daily-recommendations.schema.json'),
        cwd: input.directory,
        webSearch: false,
        timeoutMs: 15 * 60 * 1000,
        prompt: `Generate owner-facing investment recommendations using only the frozen context below. Do not fetch live data or execute orders. Inspect only the frozen files supplied below. Cover every (portfolioId,symbol) exactly once. Research rating is separate from entry timing and portfolio fit. No-trade means evaluation/entry abstention, hold is affirmative. New risk requires a validated system thesis (systemThesisValidated) or an accepted owner thesis plus fresh evidence. System recommendations are published for owner review; never rewrite the accepted owner thesis. A candidate screen is only a research lead. State evidence limitations, and never invent consensus or transcripts when they are absent. ETF evidence must be interpreted as fund exposure, never corporate earnings. Risk reductions may follow invalidation without a new bullish thesis. Compare an alternative and a counter-thesis. Include specific observable, probabilistic economic forecasts with deadlines, source IDs and falsifiers; narrative confidence is not a calibrated probability. Maximum new position is 10%; do not invent prices or sizing. For capitalBasis owner_budget, cash means owner-authorized remaining allocation budget, not broker buying power. Use this budget for recommendations without requesting funding or transfer confirmation; never claim it is settled broker cash. Choose entry.trigger explicitly: next_session_open, next_open_below_ceiling, or manual_condition. Any additional untestable condition requires manual_condition. Conditional entries expire at expiresAt and are not assumed filled. Use gaps to abstain rather than silently assuming facts. Every narrative field, entry condition, and decision dimension must contain at least eight characters; risks and invalidation must be nonempty arrays. Provide a substantive exit and reassessment rule even for watch, research, and no-trade. Expiry must be after the cutoff and within seven days; horizons are 1 to 1825 integer days, confidence is 0 to 100, and forecast probabilities are strictly between zero and one. Respond with summary and recommendations.\n${input.prompt}`,
        validate: (value) => {
          const v = record(value)
          return {
            summary: String(v.summary ?? ''),
            ...validateGeneratedBatch(v.recommendations, context),
          }
        },
      })
      const critic = await runCodexJson({
        schemaPath: resolve('schemas/recommendation-critic.schema.json'),
        cwd: input.directory,
        webSearch: false,
        timeoutMs: 8 * 60 * 1000,
        prompt: `Independently criticize these proposed decisions against the frozen evidence. Flag any unsupported economic link, overlooked contrary evidence, misleading timestamp, stale data, invalid sizing or invented factual claim. Identify blocking problems by portfolioId and symbol. Do not change the original thesis or fetch new information.\nCONTEXT ${input.prompt}\nDECISIONS ${JSON.stringify({summary: generated.data.summary, recommendations: generated.data.recommendations})}`,
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
        input: {projection: 'frozen-files-v1', manifestHash: input.manifestHash, indexBytes: input.indexBytes},
        generator: generated.metadata,
        contractFailures: generated.data.failures,
        critic: critic.metadata,
        criticBlocks: critic.data,
      }
      summary = recommendations.some((r) => r.gateReasons.length)
        ? `${recommendations.filter((r) => r.gateReasons.length).length} proposed decisions were blocked by evidence or portfolio checks. Review each final action and its reasons before changing capital.`
        : generated.data.summary
    })
  }
  const result = await db.rpc('publish_recommendation_batch', {
    p_manifest_id: context.id,
    p_recommendations: recommendations,
    p_metadata: {...record(metadata), inputAssemblyRelease: context.codeVersion,
      generationRelease: process.env.STRATUM_RELEASE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'unreported'},
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
  const readDeadline = AbortSignal.timeout(15_000)
  const viewedAt = new Date().toISOString()
  const accountsResult = await db.from('portfolios').select('id,name,kind').eq('owner_id', ownerId).abortSignal(readDeadline)
  if (accountsResult.error) throw new Error(accountsResult.error.message)
  const accounts = accountsResult.data ?? []
  const batches = await db
    .from('recommendation_batches')
    .select('id,manifest_id,decision_date,published_at,summary')
    .eq('owner_id', ownerId)
    .order('published_at', { ascending: false })
    .limit(14).abortSignal(readDeadline)
  if (batches.error) throw new Error(batches.error.message)
  const latest = batches.data?.[0] ?? null
  if (!latest)
    return {
      viewedAt,
      accounts,
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
      shadowRuns: [],
      shadowEvaluations: [],
    }
  const responses = await Promise.all([
    db
      .from('recommendation_versions')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('batch_id', latest.id)
      .order('symbol').abortSignal(readDeadline),
    db
      .from('recommendation_owner_events')
      .select('*')
      .eq('owner_id', ownerId)
      .order('recorded_at', { ascending: false })
      .limit(100).abortSignal(readDeadline),
    db
      .from('recommendation_evaluations')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(100).abortSignal(readDeadline),
    db
      .from('recommendation_input_manifests')
      .select('content,content_hash')
      .eq('id', latest.manifest_id)
      .eq('owner_id', ownerId)
      .abortSignal(readDeadline).single(),
    db
      .from('investment_newsletter_outbox')
      .select(
        'id,edition_date,investment_newsletter_delivery(status,last_attempt_at,error)',
      )
      .eq('owner_id', ownerId)
      .order('edition_date', { ascending: false })
      .limit(1).abortSignal(readDeadline)
      .maybeSingle(),
    db
      .from('recommendation_cohort_reviews')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(4).abortSignal(readDeadline),
    db
      .from('recommendation_forecasts')
      .select('*')
      .eq('owner_id', ownerId)
      .order('deadline')
      .limit(100).abortSignal(readDeadline),
    db
      .from('recommendation_policy_experiments')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(30).abortSignal(readDeadline),
    db.from('recommendation_shadow_runs').select('id,experiment_id,policy_key,batch_id,created_at').eq('owner_id',ownerId).order('created_at',{ascending:false}).limit(100).abortSignal(readDeadline),
    db.from('recommendation_shadow_evaluations').select('*').eq('owner_id',ownerId).order('created_at',{ascending:false}).limit(30).abortSignal(readDeadline),
  ])
  for (const r of responses) if (r.error) throw new Error(r.error.message)
  return {
    viewedAt,
    accounts,
    batches: batches.data,
    latest,
    recommendations: responses[0].data ?? [],
    events: responses[1].data ?? [],
    evaluations: responses[2].data ?? [],
    context: recommendationDisplayContext(responses[3].data),
    delivery: responses[4].data,
    cohorts: responses[5].data ?? [],
    forecasts: responses[6].data ?? [],
    experiments: responses[7].data ?? [],
    shadowRuns: responses[8].data ?? [],
    shadowEvaluations: responses[9].data ?? [],
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
