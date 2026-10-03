import { hasDecisiveCoverageGap, readableCompanySourceIds, type ResearchCoverage } from './research-coverage.ts'
import { COMPANY_FORECAST_METRICS } from './forecast-metrics.ts'
import { readResearchAdvice, validateResearchAdvice } from './research-advice.ts'
import { requiredEvidenceGaps, validateEvidenceAssessment, type EvidenceAssessment, type RequiredEvidenceGap } from './research-contract.ts'
import type { CompanyPacket } from './types.ts'
/** Published investment advice is an immutable, prospective experiment.
 * These functions never fetch data or place orders. */
export const RECOMMENDATION_ACTIONS = [
  'research',
  'watch',
  'buy',
  'add',
  'hold',
  'trim',
  'sell',
  'no_trade',
] as const
export type RecommendationAction = (typeof RECOMMENDATION_ACTIONS)[number]
// v1.1 corrects thesis schema/provenance. New manifests retain the original
// abstention edition rather than rewriting its frozen inputs after repair.
export const RECOMMENDATION_POLICY = 'prospective-v1.7'
export type EvidenceRef = {
  id: string
  kind: string
  url: string | null
  asOf: string | null
  availableAt: string | null
  retrievedAt: string
  hash: string
  feed: string | null
  value: unknown
}
export type DecisionName = {
  symbol: string
  securityId: string
  portfolioId: string
  portfolioName?: string
  instrumentType?: 'equity' | 'etf'
  systemThesisValidated?: boolean
  limitations?: string[]
  entryGaps?: string[]
  researchContractVersion?: 1
  evidenceAssessment?: EvidenceAssessment
  /** Deterministically captured provider/topic gaps. Universal data/identity
   * failures remain in gaps and cannot be waived by research opinions. */
  providerEvidenceGaps?: RequiredEvidenceGap[]
  owned: boolean
  quantity: number
  currentWeightPct: number | null
  portfolioValue: number | null
  cash: number
  capitalBasis?: 'broker_cash' | 'owner_budget'
  quote: { price: number; asOf: string; feed: string } | null
  research: Record<string, unknown> | null
  thesis: Record<string, unknown> | null
  sector?: string | null
  averageDollarVolume?: number | null
  evaluationPolicy?: {
    securityIds?: Record<string, string>
    benchmark: string
    peers: string[]
    peerSelection: string
    costBps: number
    baselineWeight: number
    execution: string
  }
  sources: string[]
  gaps: string[]
  causalLinks: string[]
  selectionReason: string
}
export type DecisionContext = {
  id: string
  ownerId: string
  date: string
  cutoff: string
  policy: string
  editionKey?: string
  codeVersion: string
  contracts?: { forecast?: 2; companyStory?: 1; research?: 1 }
  portfolio: unknown
  names: DecisionName[]
  evidence: EvidenceRef[]
  world: unknown
  market: unknown
  gaps: string[]
  universe: Array<{ symbol: string; reason: string; selected: boolean }>
}
export type Forecast = {
  resolutionSource?: string
  decisivePremise?: boolean
  observationPeriod?: string
  unit?: string
  proposition: string
  metric: string
  operator: 'gt' | 'lt'
  threshold: number
  probability: number
  deadline: string
  confirmation: string
  invalidation: string
  sourceIds: string[]
}
export type Recommendation = {
  symbol: string
  portfolioId: string
  action: RecommendationAction
  reason: string
  thesis: string
  counterThesis: string
  mechanism: string
  expectations: string
  horizonDays: number
  expiresAt: string
  risks: string[]
  invalidation: string[]
  confidence: number
  entry: {
    trigger?:
      | 'next_session_open'
      | 'next_open_below_ceiling'
      | 'manual_condition'
    condition: string
    maxPrice: number | null
    targetWeightPct: number | null
  }
  exit: string
  reassessWhen: string
  sourceIds: string[]
  forecasts: Forecast[]
  dimensions: {
    thesisQuality: string
    valuation: string
    timing: string
    portfolioFit: string
  }
  alternative: string
  gateReasons: string[]
  proposedAction?: RecommendationAction
}
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const texts = (v: unknown) =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : []
const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/** Packet-local source IDs are not globally unique. Freeze their provenance
 * under the immutable packet before using an actionSupport citation. */
export const decisionResearchSourceId = (packetId: string, sourceId: string) => `source:${packetId}:${sourceId}`
const availableByCutoff = (source: EvidenceRef | undefined, cutoff: string) => Boolean(source && Number.isFinite(Date.parse(source.availableAt ?? '')) && Date.parse(source.availableAt ?? '') <= Date.parse(cutoff))

function currentActionAssessment(name: DecisionName, context: DecisionContext): EvidenceAssessment | null {
  const content = obj(name.research?.content)
  if (content.researchContractVersion !== 1) return null
  const packet = context.evidence.find(e => ['company_packet', 'etf_packet'].includes(e.kind) && name.sources.includes(e.id))
  const research = context.evidence.find(e => e.kind === 'research' && name.sources.includes(e.id))
  if (!availableByCutoff(packet, context.cutoff) || !availableByCutoff(research, context.cutoff)) return null
  const packetRow = obj(packet!.value), raw = obj(packetRow.packet)
  const packetId = str(packetRow.id) || packet!.id.replace(/^packet:/, '')
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).map(obj)
  const readable = packet!.kind === 'company_packet'
    ? readableCompanySourceIds({ ...raw, sources, filings: Array.isArray(raw.filings) ? raw.filings : [], events: Array.isArray(raw.events) ? raw.events : [] } as unknown as CompanyPacket)
    : sources.map(s => str(s.id))
  const cited = texts(content.sourceIds).filter(id => readable.includes(id))
  try {
    const assessment = validateEvidenceAssessment(content.evidenceAssessment, cited, [...requiredEvidenceGaps(raw), ...(name.providerEvidenceGaps ?? [])])
    // Every cited supporting source must have captured provenance in this
    // manifest. A report citation alone cannot make future/unreadable data valid.
    for (const support of assessment.actionSupport) for (const id of support.sourceIds) {
      const original = sources.find(s => s.id === id)
      const frozen = context.evidence.find(e => e.id === decisionResearchSourceId(packetId, id) && name.sources.includes(e.id))
      const document = [...(Array.isArray(raw.researchDocuments) ? raw.researchDocuments : []), ...(Array.isArray(obj(raw.researchCoverage).documents) ? obj(raw.researchCoverage).documents as unknown[] : [])].map(obj).find(d => d.sourceId === id)
      if (!original || !availableByCutoff(frozen, context.cutoff) || !Number.isFinite(Date.parse(str(original.asOf))) || Date.parse(str(original.asOf)) > Date.parse(context.cutoff) || (document && (!Number.isFinite(Date.parse(str(document.capturedAt))) || Date.parse(str(document.capturedAt)) > Date.parse(context.cutoff) || document.extractionStatus !== 'readable'))) return null
    }
    validateResearchAdvice(content.advice, cited, { researchContractVersion: 1, evidenceAssessment: assessment })
    return assessment
  } catch { return null }
}

/** Preserve universal gates. Only a validated current report may classify
 * provider-evidence gaps by action, and Buy/Add retain their existing gates. */
export function actionEvidenceGapReasons(name: DecisionName, context: DecisionContext, action: RecommendationAction): string[] {
  const content = obj(name.research?.content), assessment = currentActionAssessment(name, context)
  const currentContractRequired = context.contracts?.research === 1 || content.researchContractVersion === 1
  const reasons = [...name.gaps]
  if (currentContractRequired && content.researchContractVersion !== 1) reasons.push('Research contract upgrade is required before a capital decision')
  if (content.researchContractVersion === 1 && !assessment) reasons.push('Current research lacks a valid frozen, cited action-specific evidence assessment')
  if (!assessment) return reasons
  if (['hold','trim','sell'].includes(action)) {
    const providerMessages = new Set((name.providerEvidenceGaps ?? []).filter(g => g.id.startsWith('packet:')).map(g => `Missing ${name.instrumentType === 'etf' ? 'fund' : 'company'} evidence: ${g.id.slice(7)}`))
    for (let i = reasons.length - 1; i >= 0; i--) if (providerMessages.has(reasons[i])) reasons.splice(i, 1)
  }
  if (!assessment.actionSupport.some(s => s.action === action)) reasons.push(`Research lacks independently cited support for ${action}`)
  for (const gap of assessment.gaps) if (gap.affectedActions.includes(action as 'buy' | 'add' | 'hold' | 'trim' | 'sell')) reasons.push(`${gap.description} blocks ${action}: ${gap.resolution}`)
  return reasons
}

/** Used only for the all-blocked generation shortcut. Provider gaps alone do
 * not establish that every possible ownership decision is blocked. */
export function hasPotentialSupportedAction(name: DecisionName, context: DecisionContext): boolean {
  const actions: RecommendationAction[] = name.owned ? ['add','hold','trim','sell'] : ['buy']
  return actions.some(action => actionEvidenceGapReasons(name, context, action).length === 0)
}

export function validateRecommendation(
  value: unknown,
  context: DecisionContext,
): Recommendation {
  const row = obj(value),
    entry = obj(row.entry),
    dimensions = obj(row.dimensions)
  const symbol = str(row.symbol),
    portfolioId = str(row.portfolioId)
  const name = context.names.find(
    (n) => n.symbol === symbol && n.portfolioId === portfolioId,
  )
  if (!name)
    throw new Error('Recommendation is outside frozen portfolio/universe')
  if (!RECOMMENDATION_ACTIONS.includes(row.action as RecommendationAction))
    throw new Error('Invalid recommendation action')
  for (const key of [
    'reason',
    'thesis',
    'counterThesis',
    'mechanism',
    'expectations',
    'exit',
    'reassessWhen',
    'alternative',
  ])
    if (str(row[key]).length < 8) throw new Error(`Missing ${key}`)
  const horizon = num(row.horizonDays),
    confidence = num(row.confidence)
  if (
    horizon === null ||
    horizon < 1 ||
    horizon > 1825 ||
    !Number.isInteger(horizon) ||
    confidence === null ||
    confidence < 0 ||
    confidence > 100
  )
    throw new Error('Invalid horizon/confidence')
  const expiresAt = str(row.expiresAt)
  if (
    !(Date.parse(expiresAt) > Date.parse(context.cutoff)) ||
    Date.parse(expiresAt) > Date.parse(context.cutoff) + 7 * 86400000
  )
    throw new Error('Recommendation expiry must be within seven days')
  const allowed = new Set(context.evidence.map((e) => e.id))
  const sourceIds = texts(row.sourceIds)
  if (sourceIds.some((id) => !allowed.has(id)))
    throw new Error('Unknown recommendation citation')
  const forecasts: Forecast[] = (
    Array.isArray(row.forecasts) ? row.forecasts : []
  ).map((v) => {
    const f = obj(v),
      probability = num(f.probability),
      threshold = num(f.threshold)
    if (
      probability === null ||
      probability <= 0 ||
      probability >= 1 ||
      threshold === null ||
      !['gt', 'lt'].includes(str(f.operator)) ||
      !(Date.parse(str(f.deadline)) > Date.parse(context.cutoff))
    )
      throw new Error('Invalid forecast')
    if (
      !str(f.metric) ||
      !str(f.proposition) ||
      !str(f.confirmation) ||
      !str(f.invalidation)
    )
      throw new Error('Forecast needs observable resolution rules')
    const ids = texts(f.sourceIds)
    if (!ids.length || ids.some((id) => !allowed.has(id)))
      throw new Error('Unknown forecast evidence')
    const observationPeriod = typeof f.observationPeriod === 'string' ? f.observationPeriod : undefined
    const unit = typeof f.unit === 'string' ? f.unit.trim() : undefined
    if ((observationPeriod !== undefined || unit !== undefined) &&
      (!observationPeriod || !/^\d{4}-\d{2}-\d{2}$/.test(observationPeriod) ||
        !Number.isFinite(Date.parse(observationPeriod)) || new Date(observationPeriod).toISOString().slice(0, 10) !== observationPeriod ||
        observationPeriod > str(f.deadline).slice(0, 10) || !unit)) throw new Error('Forecast needs an exact observation period and unit')
    const resolutionSource = str(f.resolutionSource)
    if (context.contracts?.forecast === 2) {
      if (str(f.metric).startsWith('FMP:') && !Object.hasOwn(COMPANY_FORECAST_METRICS,str(f.metric))) throw new Error('Unsupported automatic forecast metric; declare a sourced manual question instead')
      if (!observationPeriod || !unit || typeof f.decisivePremise !== 'boolean') throw new Error('New forecasts require period, unit and decisive-premise designation')
      if (!(resolutionSource === str(f.metric) && /^(FRED:|FMP:)/.test(resolutionSource)) && !(resolutionSource.startsWith('source:') && ids.includes(resolutionSource.slice(7)))) throw new Error('Forecast needs a declared resolution source in its frozen evidence')
    }
    return {
      ...(resolutionSource ? { resolutionSource, decisivePremise: f.decisivePremise === true } : {}),
      ...(observationPeriod ? { observationPeriod, unit } : {}),
      proposition: str(f.proposition),
      metric: str(f.metric),
      operator: f.operator as 'gt' | 'lt',
      threshold,
      probability,
      deadline: str(f.deadline),
      confirmation: str(f.confirmation),
      invalidation: str(f.invalidation),
      sourceIds: ids,
    }
  })
  if (
    entry.trigger !== undefined &&
    ![
      'next_session_open',
      'next_open_below_ceiling',
      'manual_condition',
    ].includes(String(entry.trigger))
  )
    throw new Error('Invalid entry trigger')
  const weight = num(entry.targetWeightPct),
    maxPrice = num(entry.maxPrice)
  if (
    (weight !== null && (weight < 0 || weight > 100)) ||
    (maxPrice !== null && maxPrice <= 0)
  )
    throw new Error('Invalid exposure/price')
  if (
    str(entry.condition).length < 8 ||
    !texts(row.risks).length ||
    !texts(row.invalidation).length
  )
    throw new Error('Missing entry/risk/invalidation conditions')
  for (const key of ['thesisQuality', 'valuation', 'timing', 'portfolioFit'])
    if (str(dimensions[key]).length < 8)
      throw new Error(`Missing decision dimension ${key}`)
  return {
    symbol,
    portfolioId,
    action: row.action as RecommendationAction,
    reason: str(row.reason),
    thesis: str(row.thesis),
    counterThesis: str(row.counterThesis),
    mechanism: str(row.mechanism),
    expectations: str(row.expectations),
    horizonDays: horizon,
    expiresAt,
    risks: texts(row.risks),
    invalidation: texts(row.invalidation),
    confidence,
    entry: {
      trigger: (entry.trigger ??
        'manual_condition') as Recommendation['entry']['trigger'],
      condition: str(entry.condition),
      maxPrice,
      targetWeightPct: weight,
    },
    exit: str(row.exit),
    reassessWhen: str(row.reassessWhen),
    sourceIds,
    forecasts,
    dimensions: dimensions as Recommendation['dimensions'],
    alternative: str(row.alternative),
    gateReasons: [],
  }
}

export function gateRecommendation(
  rec: Recommendation,
  context: DecisionContext,
): Recommendation {
  const name = context.names.find(
    (n) => n.symbol === rec.symbol && n.portfolioId === rec.portfolioId,
  )
  if (!name) throw new Error('Missing frozen name')
  const reasons: string[] = []
  const capitalAction = ['buy', 'add', 'hold', 'trim', 'sell'].includes(
    rec.action,
  )
  const increase = rec.action === 'buy' || rec.action === 'add'
  const reducing = rec.action === 'trim' || rec.action === 'sell'
  const researchContent = obj(name.research?.content)
  const assessment = currentActionAssessment(name, context)
  const advice = readResearchAdvice(researchContent.advice, undefined, researchContent)
  const packetEvidence = context.evidence.find(e => ['company_packet','etf_packet'].includes(e.kind) && name.sources.includes(e.id))
  const coverage = obj(obj(packetEvidence?.value).packet).researchCoverage as ResearchCoverage | undefined
  if (coverage && hasDecisiveCoverageGap(coverage)) {
    if (increase) reasons.push('Decisive company research coverage remains unresolved')
    if (['hold','trim','sell'].includes(rec.action) && !assessment) {
      const justification=obj(obj(obj(name.research?.content).coverageReview).actionJustifications)[rec.action]
      if(typeof justification!=='string' || justification.trim().length<40) reasons.push('Company research coverage gap requires an independently supported action justification')
    }
  }
  if (advice) {
    if (increase && (advice.newEntryStance.value !== 'eligible' || advice.evidenceSufficiency.value !== 'sufficient')) reasons.push('Research does not establish sufficient evidence for eligible new risk')
    if (rec.action === 'hold' && advice.existingPositionStance.value !== 'retain') reasons.push('Hold requires an affirmative existing-position retain stance')
    if (rec.action === 'sell' && advice.existingPositionStance.value !== 'exit' && name.thesis?.status !== 'invalidated') reasons.push('Sell conflicts with the existing-position stance')
    if (rec.action === 'trim' && !['reduce', 'exit'].includes(advice.existingPositionStance.value) && name.thesis?.status !== 'invalidated') reasons.push('Trim conflicts with the existing-position stance')
  }
  if (rec.action === 'hold' && rec.entry.targetWeightPct !== null && rec.entry.targetWeightPct !== name.currentWeightPct) reasons.push('Hold must preserve the frozen positive exposure; a reduction needs trim or sell')
  if (capitalAction) {
    // Shared macro/World gaps constrain adding risk, but cannot veto an
    // independently supported exit or hold in another instrument/account.
    reasons.push(...actionEvidenceGapReasons(name, context, rec.action), ...(increase ? context.gaps : []))
    if (assessment) {
      const support = assessment.actionSupport.find(s => s.action === rec.action)
      const researchEvidence = context.evidence.find(e => e.kind === 'research' && name.sources.includes(e.id))
      const packetId = str(obj(packetEvidence?.value).id) || packetEvidence?.id.replace(/^packet:/, '')
      if (!researchEvidence || !rec.sourceIds.includes(researchEvidence.id) || !packetEvidence || !rec.sourceIds.includes(packetEvidence.id) || !support || support.sourceIds.some(id => !packetId || !rec.sourceIds.includes(decisionResearchSourceId(packetId, id)))) reasons.push('Decision must cite the frozen research, packet and independent sources supporting this action')
    }
    if (
      !name.quote ||
      !Number.isFinite(Date.parse(name.quote.asOf)) ||
      Date.parse(name.quote.asOf) > Date.parse(context.cutoff) ||
      Date.parse(context.cutoff) - Date.parse(name.quote.asOf) > 96 * 3600000
    )
      reasons.push(
        'Price is unavailable, future-dated or older than four calendar days',
      )
    if (!rec.sourceIds.length)
      reasons.push('Decision lacks supporting evidence')
    if (increase && !rec.forecasts.length)
      reasons.push('No evidence-backed, measurable forecast')
    if (!name.research)
      reasons.push('Completed instrument research is unavailable')
  }
  if (['add', 'hold', 'trim', 'sell'].includes(rec.action) && !name.owned)
    reasons.push('Action requires an existing holding')
  if (rec.action === 'buy' && name.owned)
    reasons.push('Existing exposure requires add rather than buy')
  if (increase) {
    reasons.push(...(name.entryGaps ?? []))
    if (!name.sector)
      reasons.push('Sector exposure classification is unavailable')
    if (
      !name.averageDollarVolume ||
      !name.portfolioValue ||
      rec.entry.targetWeightPct === null ||
      (rec.entry.targetWeightPct / 100) * name.portfolioValue >
        name.averageDollarVolume * 0.1
    )
      reasons.push(
        'Target exposure lacks verified 20-session liquidity within 10% of average dollar volume',
      )
    if (name.thesis?.status === 'invalidated') reasons.push('Owner thesis is invalidated; new risk requires explicit reassessment')
    if (name.thesis?.status !== 'accepted' && name.systemThesisValidated !== true)
      reasons.push('New risk requires a validated system thesis or an owner-accepted thesis')
    if (
      rec.entry.maxPrice === null ||
      !name.quote ||
      name.quote.price > rec.entry.maxPrice
    )
      reasons.push('Price does not satisfy entry ceiling')
    const target = rec.entry.targetWeightPct,
      current = name.currentWeightPct
    if (
      target === null ||
      current === null ||
      !name.portfolioValue ||
      target <= current ||
      target > 10
    )
      reasons.push(
        'Sizing requires known portfolio values and a positive increase within the 10% position cap',
      )
    else if (((target - current) / 100) * name.portfolioValue > name.cash)
      reasons.push('Insufficient unallocated cash')
  }
  if (reducing) {
    const researchContent = obj(name.research?.content)
    const supportedExit = name.thesis?.status === 'invalidated' || researchContent.formalRating === 'SELL' || assessment?.actionSupport.some(s => s.action === rec.action)
    if (!rec.forecasts.length && !supportedExit)
      reasons.push('Risk reduction requires evidenced thesis invalidation, exit research, or a measurable risk forecast')
    const target = rec.entry.targetWeightPct,
      current = name.currentWeightPct
    if (
      target === null ||
      current === null ||
      target >= current ||
      (rec.action === 'sell' && target !== 0) ||
      (rec.action === 'trim' && target <= 0)
    )
      reasons.push('Reduction must lower existing exposure; sell targets zero')
  }
  if (rec.action === 'hold' && (name.thesis?.status === 'invalidated' || researchContent.formalRating === 'SELL' || (researchContent.formalRating === 'NOT_RATED' && !assessment?.actionSupport.some(s => s.action === 'hold'))))
    reasons.push('Affirmative hold conflicts with thesis invalidation, exit research, or an unrated evidence case')
  for (const id of [
    ...rec.sourceIds,
    ...rec.forecasts.flatMap((f) => f.sourceIds),
  ]) {
    const source = context.evidence.find((e) => e.id === id)
    if (
      !source ||
      !Number.isFinite(Date.parse(source.availableAt ?? '')) ||
      Date.parse(source.availableAt ?? '') > Date.parse(context.cutoff)
    )
      reasons.push('Evidence was unavailable at the decision cutoff')
  }
  if (!reasons.length) return rec
  return {
    ...rec,
    proposedAction: rec.action,
    sourceIds: rec.sourceIds.filter(id => context.evidence.some(e => e.id === id && Number.isFinite(Date.parse(e.availableAt ?? '')) && Date.parse(e.availableAt ?? '') <= Date.parse(context.cutoff))),
    action: 'no_trade',
    gateReasons: [...new Set(reasons)],
    reason: `Evaluation blocked: ${[...new Set(reasons)].join('; ')}. Existing holdings have not been declared safe.`,
    entry: { ...rec.entry, targetWeightPct: null },
  }
}

export function abstention(
  name: DecisionName,
  context: DecisionContext,
  reason: string,
): Recommendation {
  return {
    symbol: name.symbol,
    portfolioId: name.portfolioId,
    action: 'no_trade',
    reason,
    thesis:
      'No current investment conclusion can be established from this evidence set.',
    counterThesis:
      'The omitted evidence could materially contradict the prior investment view.',
    mechanism:
      'The economic transmission mechanism requires verified company evidence.',
    expectations: 'Current priced expectations have not been established.',
    horizonDays: 20,
    expiresAt: new Date(Date.parse(context.cutoff) + 86400000).toISOString(),
    risks: [
      'Existing positions remain exposed while this evaluation is incomplete.',
    ],
    invalidation: [
      'Do not treat this abstention as confirmation of an existing thesis.',
    ],
    confidence: 0,
    entry: {
      condition: 'Do not change capital based on this incomplete evaluation.',
      maxPrice: null,
      targetWeightPct: null,
    },
    exit: 'Existing owner risk controls remain applicable; this evaluation does not replace them.',
    reassessWhen: 'Required data is restored and a new version is published.',
    sourceIds: name.sources,
    forecasts: [],
    dimensions: {
      thesisQuality: 'Not evaluated from sufficient evidence.',
      valuation: 'Not established from current data.',
      timing: 'No validated entry signal.',
      portfolioFit: 'Existing exposure is retained in the frozen context.',
    },
    alternative:
      'Prioritize research and restore missing evidence before acting.',
    gateReasons: [reason],
  }
}

export function validateBatch(
  values: unknown,
  context: DecisionContext,
): Recommendation[] {
  if (!Array.isArray(values) || values.length !== context.names.length)
    throw new Error('Daily batch must cover every required name/account')
  const rows = values.map((v) =>
    gateRecommendation(validateRecommendation(v, context), context),
  )
  if (
    new Set(rows.map((r) => `${r.portfolioId}:${r.symbol}`)).size !==
    context.names.length
  )
    throw new Error('Duplicate recommendation hides an uncovered holding')
  // Portfolio cash and concentration are joint constraints, not independent per-name permissions.
  for (const portfolioId of new Set(rows.map((r) => r.portfolioId))) {
    const increases = rows.filter(
      (r) => r.portfolioId === portfolioId && ['buy', 'add'].includes(r.action),
    )
    const names = context.names.filter((n) => n.portfolioId === portfolioId)
    const cash = names[0]?.cash ?? 0
    const required = increases.reduce((sum, rec) => {
      const n = names.find((n) => n.symbol === rec.symbol)!
      return (
        sum +
        (((rec.entry.targetWeightPct ?? 0) - (n.currentWeightPct ?? 0)) / 100) *
          (n.portfolioValue ?? 0)
      )
    }, 0)
    const sectorExceeded = increases.some((rec) => {
      const name = names.find((n) => n.symbol === rec.symbol)!
      const exposure = names
        .filter((n) => n.sector === name.sector)
        .reduce(
          (sum, n) =>
            sum +
            (rows.find(
              (r) =>
                r.portfolioId === portfolioId &&
                r.symbol === n.symbol &&
                ['buy', 'add'].includes(r.action),
            )?.entry.targetWeightPct ??
              n.currentWeightPct ??
              0),
          0,
        )
      return exposure > 30
    })
    if (required > cash || sectorExceeded)
      for (const rec of increases)
        Object.assign(rec, {
          proposedAction: rec.action,
          action: 'no_trade',
          entry: { ...rec.entry, targetWeightPct: null },
          gateReasons: [
            sectorExceeded
              ? 'Combined sector exposure exceeds 30%'
              : 'Combined recommendations exceed available cash',
          ],
          reason:
            'Combined portfolio cash or concentration limits are exceeded; no capital action is approved.',
        })
  }
  return rows
}

/** Preserve complete coverage and joint portfolio gates, but isolate a model's
 * malformed contract to the affected name. Never repair it into a capital action. */
export function validateGeneratedBatch(values: unknown, context: DecisionContext) {
  if (!Array.isArray(values) || values.length !== context.names.length) throw new Error('Daily batch must cover every required name/account')
  const seen = new Set<string>()
  const failures: Array<{symbol: string; portfolioId: string; error: string; rejected: unknown}> = []
  const blocked = new Map<string, Recommendation>()
  const prepared = values.map(value => {
    const raw = obj(value), symbol = str(raw.symbol), portfolioId = str(raw.portfolioId)
    const key = `${portfolioId}:${symbol}`
    const name = context.names.find(n => n.symbol === symbol && n.portfolioId === portfolioId)
    if (!name || seen.has(key)) throw new Error('Generated coverage contains an unknown or duplicate name/account')
    seen.add(key)
    try {
      return validateRecommendation(value, context)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid generated recommendation'
      const replacement = abstention(name, context, `Generated decision failed contract validation: ${message}. No action was approved for this name.`)
      failures.push({symbol, portfolioId, error: message, rejected: value})
      blocked.set(key, replacement)
      return replacement
    }
  })
  const recommendations = validateBatch(prepared, context).map(r => blocked.get(`${r.portfolioId}:${r.symbol}`) ?? r)
  return { recommendations, failures }
}

/** Final revalidation consumes locally gated and independently reviewed rows.
 * Keep their veto provenance while still checking coverage, shape, citations
 * and joint portfolio limits. Initial model output never enters this path. */
export function revalidateReviewedBatch(values: Recommendation[], context: DecisionContext): Recommendation[] {
  const checked = validateGeneratedBatch(values, context)
  const failures = new Set(checked.failures.map(f => `${f.portfolioId}:${f.symbol}`))
  return checked.recommendations.map((row, index) => {
    const reviewed = values[index]
    if (reviewed.action !== 'no_trade' || row.action !== 'no_trade' || !reviewed.gateReasons.length || failures.has(`${row.portfolioId}:${row.symbol}`)) return row
    return { ...row, reason: reviewed.reason, gateReasons: [...new Set([...row.gateReasons, ...reviewed.gateReasons])], ...(reviewed.proposedAction ? { proposedAction: reviewed.proposedAction } : {}), entry: { ...row.entry, targetWeightPct: null } }
  })
}
