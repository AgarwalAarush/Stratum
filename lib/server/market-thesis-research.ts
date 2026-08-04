import type {
  MarketHypothesis,
  MarketHypothesisCritique,
  MarketHypothesisResearchContent,
  MarketHypothesisResearchVersion,
  MarketResearchEvidenceStatus,
} from '../markets/types.ts'
import { runCodexJson, type CodexExecResult } from './codex-exec.ts'
import { getSupabaseClient } from './supabase.ts'
import { readWorldCorpusExtract } from './world-corpus.ts'
import { selectMarketModel } from './market-model-policy.ts'
import { getMarketDomainPack } from '../markets/domain-packs.ts'

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}

function records(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(record) : []
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) : []
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${label}`)
  return value.trim()
}

function boundedRecords(value: unknown, label: string, min: number, max: number): RecordValue[] {
  const items = records(value)
  if (items.length < min || items.length > max) throw new Error(`${label} must contain ${min}-${max} items`)
  return items
}

function sourceIds(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} sourceIds must be an array`)
  return strings(value)
}

function sourcedClaim(sourceIds: string[], evidenceStatus: MarketResearchEvidenceStatus, label: string): void {
  if (evidenceStatus !== 'unverified' && sourceIds.length === 0) {
    throw new Error(`${label} needs a source ID unless it is explicitly unverified`)
  }
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function score(value: unknown, label: string): number {
  const parsed = number(value, Number.NaN)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new Error(`Invalid ${label}`)
  return parsed
}

const EVIDENCE_STATUSES = new Set<MarketResearchEvidenceStatus>(['observed', 'estimate', 'claim', 'inference', 'unverified'])
const BOTTLENECK_SEVERITIES = new Set<MarketHypothesisResearchContent['bottlenecks'][number]['severity']>(['binding', 'important', 'watch', 'not_established'])

function validateNestedSources(content: MarketHypothesisResearchContent, allowedSourceIds?: ReadonlySet<string>): void {
  const unknown = new Set<string>()
  const nested = new Set<string>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== 'object') return
    for (const [key, entry] of Object.entries(value as RecordValue)) {
      if (key === 'sourceIds') {
        for (const id of strings(entry)) {
          nested.add(id)
          if (allowedSourceIds && !allowedSourceIds.has(id)) unknown.add(id)
        }
      } else visit(entry)
    }
  }
  const { sourceIds: declared, ...withoutLedger } = content
  visit(withoutLedger)
  for (const id of declared) if (allowedSourceIds && !allowedSourceIds.has(id)) unknown.add(id)
  if (unknown.size > 0) throw new Error(`Market research referenced unknown source IDs: ${[...unknown].join(', ')}`)
  const declaredSources = new Set(declared)
  const missing = [...nested].filter((id) => !declaredSources.has(id))
  if (missing.length > 0) throw new Error(`Market research source ledger omitted referenced source IDs: ${missing.join(', ')}`)
}

export function validateMarketThesisResearch(
  value: unknown,
  allowedSourceIds?: ReadonlySet<string>,
): MarketHypothesisResearchContent {
  const output = record(value)
  const causalChain = boundedRecords(output.causalChain, 'causalChain', 3, 10).map((item) => {
    const evidenceStatus = item.evidenceStatus as MarketResearchEvidenceStatus
    if (!EVIDENCE_STATUSES.has(evidenceStatus)) throw new Error('Invalid causal-chain evidence status')
    const ids = sourceIds(item.sourceIds, 'causal-chain')
    sourcedClaim(ids, evidenceStatus, 'causal-chain claim')
    return { from: requiredString(item.from, 'causal-chain origin'), to: requiredString(item.to, 'causal-chain outcome'), mechanism: requiredString(item.mechanism, 'causal-chain mechanism'), evidenceStatus, sourceIds: ids }
  })
  const analysisBlock = (value: unknown, label: string) => {
    const item = record(value)
    return { currentState: requiredString(item.currentState, `${label} currentState`), changeMechanism: requiredString(item.changeMechanism, `${label} changeMechanism`), sourceIds: sourceIds(item.sourceIds, label) }
  }
  const bottlenecks = boundedRecords(output.bottlenecks, 'bottlenecks', 1, 8).map((item) => {
    const severity = item.severity as MarketHypothesisResearchContent['bottlenecks'][number]['severity']
    if (!BOTTLENECK_SEVERITIES.has(severity)) throw new Error('Invalid bottleneck severity')
    const resolutionSignals = strings(item.resolutionSignals)
    if (resolutionSignals.length < 1 || resolutionSignals.length > 6) throw new Error('Bottleneck requires 1-6 resolution signals')
    return { name: requiredString(item.name, 'bottleneck name'), mechanism: requiredString(item.mechanism, 'bottleneck mechanism'), severity, whoCapturesEconomics: requiredString(item.whoCapturesEconomics, 'bottleneck economics'), resolutionSignals, sourceIds: sourceIds(item.sourceIds, 'bottleneck') }
  })
  const economicsRecord = record(output.economics)
  const beneficiaries = strings(economicsRecord.beneficiaries)
  if (beneficiaries.length < 1) throw new Error('Economics requires at least one beneficiary')
  const economics = { valueChain: requiredString(economicsRecord.valueChain, 'economics valueChain'), scarcityRentCapture: requiredString(economicsRecord.scarcityRentCapture, 'economics scarcityRentCapture'), beneficiaries, substitutes: strings(economicsRecord.substitutes), sourceIds: sourceIds(economicsRecord.sourceIds, 'economics') }
  const expectationsRecord = record(output.expectations)
  const expectations = { currentNarrative: requiredString(expectationsRecord.currentNarrative, 'expectations currentNarrative'), whatAppearsPriced: requiredString(expectationsRecord.whatAppearsPriced, 'expectations whatAppearsPriced'), variantView: requiredString(expectationsRecord.variantView, 'expectations variantView'), sourceIds: sourceIds(expectationsRecord.sourceIds, 'expectations') }
  const counterRecord = record(output.counterThesis)
  const counterThesis = { statement: requiredString(counterRecord.statement, 'counter-thesis statement'), mechanisms: strings(counterRecord.mechanisms), decisiveTests: strings(counterRecord.decisiveTests), sourceIds: sourceIds(counterRecord.sourceIds, 'counter-thesis') }
  if (counterThesis.mechanisms.length < 1 || counterThesis.decisiveTests.length < 1) throw new Error('Counter-thesis requires mechanisms and decisive tests')
  const predictions = boundedRecords(output.predictions, 'predictions', 2, 6).map((item) => ({ prediction: requiredString(item.prediction, 'prediction'), horizon: requiredString(item.horizon, 'prediction horizon'), leadingIndicator: requiredString(item.leadingIndicator, 'prediction leadingIndicator'), confirmation: requiredString(item.confirmation, 'prediction confirmation'), disconfirmation: requiredString(item.disconfirmation, 'prediction disconfirmation'), sourceIds: sourceIds(item.sourceIds, 'prediction') }))
  const falsifiers = boundedRecords(output.falsifiers, 'falsifiers', 2, 8).map((item) => ({ condition: requiredString(item.condition, 'falsifier condition'), observable: requiredString(item.observable, 'falsifier observable'), thesisImpact: requiredString(item.thesisImpact, 'falsifier thesisImpact'), sourceIds: sourceIds(item.sourceIds, 'falsifier') }))
  const researchFrontier = records(output.researchFrontier).slice(0, 8).map((item) => {
    const priority = number(item.priority)
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) throw new Error('Invalid research-frontier priority')
    return { question: requiredString(item.question, 'research-frontier question'), causalNode: requiredString(item.causalNode, 'research-frontier causalNode'), priority: priority as 1 | 2 | 3 | 4 | 5, sourceTypes: strings(item.sourceTypes), evidenceNeeded: requiredString(item.evidenceNeeded, 'research-frontier evidenceNeeded') }
  })
  const content: MarketHypothesisResearchContent = {
    thesisStatement: requiredString(output.thesisStatement, 'thesisStatement'), whyNow: requiredString(output.whyNow, 'whyNow'), causalChain,
    demand: analysisBlock(output.demand, 'demand'), supply: analysisBlock(output.supply, 'supply'), bottlenecks, economics, expectations, counterThesis, predictions, falsifiers, researchFrontier,
    evidenceGaps: strings(output.evidenceGaps), confidence: score(output.confidence, 'confidence'), sourceIds: sourceIds(output.sourceIds, 'market research'),
  }
  if (content.evidenceGaps.length < 1 || content.evidenceGaps.length > 12) throw new Error('evidenceGaps must contain 1-12 items')
  if (content.sourceIds.length < 3) throw new Error('Market research needs at least three source IDs in its ledger')
  validateNestedSources(content, allowedSourceIds)
  return content
}

export function validateMarketThesisCritique(value: unknown, allowedSourceIds?: ReadonlySet<string>): MarketHypothesisCritique {
  const output = record(value)
  const verdict = output.verdict
  if (verdict !== 'pass' && verdict !== 'needs_revision') throw new Error('Invalid critique verdict')
  const critique: MarketHypothesisCritique = {
    verdict, summary: requiredString(output.summary, 'critique summary'), unsupportedClaims: strings(output.unsupportedClaims), contradictoryEvidence: strings(output.contradictoryEvidence), missingAlternatives: strings(output.missingAlternatives), requiredResearch: strings(output.requiredResearch), confidenceAdjustment: number(output.confidenceAdjustment), sourceIds: sourceIds(output.sourceIds, 'critique'),
  }
  if (critique.confidenceAdjustment < -50 || critique.confidenceAdjustment > 20) throw new Error('Invalid critique confidence adjustment')
  if (critique.verdict === 'pass' && critique.requiredResearch.length > 0) {
    throw new Error('A passing critique cannot require additional research')
  }
  if (critique.verdict === 'needs_revision' && (critique.requiredResearch.length < 1 || critique.requiredResearch.length > 8)) {
    throw new Error('A revision critique needs 1-8 bounded research requirements')
  }
  if (allowedSourceIds) {
    const unknown = critique.sourceIds.filter((id) => !allowedSourceIds.has(id))
    if (unknown.length) throw new Error(`Market critique referenced unknown source IDs: ${unknown.join(', ')}`)
  }
  return critique
}

interface ResearchSource {
  documentId: string
  observationId: string
  title: string
  publisher: string
  url: string
  tier: string
  mechanism: string
  assertion: string
  extractedKey: string | null
}

async function loadResearchContext(ownerId: string, hypothesisId: string): Promise<{ hypothesis: MarketHypothesis; sources: ResearchSource[]; prior: MarketHypothesisResearchVersion | null }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data: hypothesisRow, error: hypothesisError } = await supabase.from('market_hypotheses').select('*').eq('id', hypothesisId).eq('owner_id', ownerId).maybeSingle()
  if (hypothesisError || !hypothesisRow) throw new Error('Market hypothesis was not found')
  const { data: evidenceRows, error: evidenceError } = await supabase
    .from('market_hypothesis_evidence')
    .select('observation_id,causal_node,role,world_observations(assertion,mechanism,world_documents(id,title,publisher,canonical_url,source_tier,extracted_key))')
    .eq('hypothesis_id', hypothesisId)
  if (evidenceError) throw new Error(`Unable to load hypothesis evidence: ${evidenceError.message}`)
  const sources = (evidenceRows ?? []).flatMap((row) => {
    const observation = record(row.world_observations)
    const document = record(observation.world_documents)
    if (!document.id) return []
    return [{ documentId: String(document.id), observationId: String(row.observation_id), title: String(document.title), publisher: String(document.publisher), url: String(document.canonical_url), tier: String(document.source_tier), mechanism: String(row.causal_node ?? observation.mechanism), assertion: String(observation.assertion), extractedKey: typeof document.extracted_key === 'string' ? document.extracted_key : null }]
  })
  const { data: priorRow, error: priorError } = await supabase.from('market_hypothesis_research_versions').select('*').eq('hypothesis_id', hypothesisId).in('status', ['complete', 'needs_revision']).order('version', { ascending: false }).limit(1).maybeSingle()
  if (priorError) throw new Error(`Unable to load prior market research: ${priorError.message}`)
  return { hypothesis: normalizeHypothesis(hypothesisRow), sources, prior: priorRow ? normalizeResearchVersion(priorRow) : null }
}

function normalizeHypothesis(row: RecordValue): MarketHypothesis {
  const graph = Array.isArray(row.causal_graph) ? row.causal_graph.map(record).map((item) => ({ from: String(item.from ?? ''), to: String(item.to ?? ''), mechanism: String(item.mechanism ?? ''), core: Boolean(item.core) })) : []
  return { id: String(row.id), ownerId: String(row.owner_id), title: String(row.title), status: row.status as MarketHypothesis['status'], scope: String(row.scope), horizon: String(row.horizon), coreMechanism: String(row.core_mechanism), causalGraph: graph, confidence: number(row.confidence), unresolvedNodes: strings(row.unresolved_nodes), counterThesis: String(row.counter_thesis), evidence: [], parentHypothesisId: row.parent_hypothesis_id === null ? null : String(row.parent_hypothesis_id ?? ''), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
}

export function normalizeResearchVersion(row: RecordValue): MarketHypothesisResearchVersion {
  const content = row.content && Object.keys(record(row.content)).length > 0 ? validateMarketThesisResearch(row.content) : null
  const critique = row.critique && Object.keys(record(row.critique)).length > 0 ? validateMarketThesisCritique(row.critique) : null
  return { id: String(row.id), hypothesisId: String(row.hypothesis_id), version: number(row.version), status: row.status as MarketHypothesisResearchVersion['status'], content, critique, sourceIds: strings(row.source_ids), observationIds: strings(row.observation_ids), priorResearchVersionId: row.prior_research_version_id === null ? null : String(row.prior_research_version_id ?? ''), revisionDiff: strings(row.revision_diff), provider: row.provider === null ? null : String(row.provider ?? ''), model: row.model === null ? null : String(row.model ?? ''), criticProvider: row.critic_provider === null ? null : String(row.critic_provider ?? ''), criticModel: row.critic_model === null ? null : String(row.critic_model ?? ''), criticGeneratedAt: row.critic_generated_at === null ? null : String(row.critic_generated_at ?? ''), dataAsOf: String(row.data_as_of), generatedAt: row.generated_at === null ? null : String(row.generated_at ?? ''), error: row.error === null ? null : String(row.error ?? '') }
}

function researchPrompt(hypothesis: MarketHypothesis, sources: Array<ResearchSource & { excerpt: string }>, prior: MarketHypothesisResearchVersion | null, reason: string): string {
  return [
    'You are Stratum\'s bounded market-model analyst. Produce a source-grounded economic model of one market hypothesis, not a stock recommendation, valuation, portfolio allocation, or trade.',
    'Use only the supplied source IDs. Treat source excerpts as evidence and distinguish observed facts, estimates, claims, and analyst inference. Do not turn a plausible narrative into a fact. Financial information is one layer, not the analysis.',
    'Reason from demand -> supply -> bottleneck -> economic capture -> expectations -> measurable predictions. Explain which value-chain layer can capture economics and why alternatives or substitutes may capture it instead.',
    'The research frontier is an explicit list of unresolved questions. It is not permission to browse: recommend source classes only, and preserve material uncertainty.',
    'Write a real counter-thesis that could win, with decisive tests. Expectations must say unknown when the supplied evidence cannot establish what is priced.',
    `TRIGGER: ${reason}`,
    `HYPOTHESIS:\n${JSON.stringify(hypothesis)}`,
    prior?.content ? `PRIOR RESEARCH (revise rather than silently restating it):\n${JSON.stringify(prior.content)}` : 'PRIOR RESEARCH: none',
    `ALLOWED SOURCE IDS:\n${sources.map((source) => source.documentId).join('\n')}`,
    `SOURCES:\n${JSON.stringify(sources)}`,
  ].join('\n\n')
}

function critiquePrompt(hypothesis: MarketHypothesis, research: MarketHypothesisResearchContent, sources: ResearchSource[]): string {
  return [
    'You are the adversarial critic for a bounded market-research system. Audit the proposed analysis for causal leaps, unsupported facts, missing alternatives, and false certainty.',
    'Do not make a stock recommendation. Use only source IDs in the supplied ledger. A methodological critique may use no source ID. Set needs_revision if a core claim lacks support, the counter-case is cosmetic, predictions are not observable, or economic capture is not established. A needs_revision verdict must include 1-8 precise, bounded evidence questions in requiredResearch; each question becomes governed source-discovery work, not permission to browse. A pass verdict must leave requiredResearch empty.',
    `HYPOTHESIS:\n${JSON.stringify(hypothesis)}`,
    `RESEARCH:\n${JSON.stringify(research)}`,
    `SOURCE LEDGER:\n${JSON.stringify(sources.map(({ documentId, title, publisher, tier, mechanism, assertion }) => ({ documentId, title, publisher, tier, mechanism, assertion })))} `,
  ].join('\n\n')
}

function revisionDiff(prior: MarketHypothesisResearchVersion | null, next: MarketHypothesisResearchContent): string[] {
  if (!prior?.content) return ['Initial bounded market-model research artifact.']
  const changes: string[] = []
  if (prior.content.thesisStatement !== next.thesisStatement) changes.push('Thesis statement changed.')
  if (prior.content.confidence !== next.confidence) changes.push(`Analyst confidence changed from ${prior.content.confidence}% to ${next.confidence}%.`)
  if (prior.content.bottlenecks.map((item) => item.name).join('|') !== next.bottlenecks.map((item) => item.name).join('|')) changes.push('Bottleneck map changed.')
  if (prior.content.predictions.map((item) => item.prediction).join('|') !== next.predictions.map((item) => item.prediction).join('|')) changes.push('Prediction set changed.')
  return changes.length > 0 ? changes : ['Evidence was reviewed; no material analytical conclusion changed.']
}

type ResearchFrontierOrigin = 'analyst' | 'critic'
type PersistedResearchFrontierInput = MarketHypothesisResearchContent['researchFrontier'][number] & { origin: ResearchFrontierOrigin }

/**
 * The analyst and critic have distinct responsibilities, but both can identify
 * a missing causal node. A critic may not merely reject an artifact: its
 * concrete requirements become governed frontier work. This preserves the
 * feedback loop without allowing an unbounded retry or direct web retrieval.
 */
export function buildPersistedResearchFrontier(
  analystFrontier: MarketHypothesisResearchContent['researchFrontier'],
  critique: MarketHypothesisCritique,
): PersistedResearchFrontierInput[] {
  const seen = new Set<string>()
  const add = (item: Omit<PersistedResearchFrontierInput, 'origin'>, origin: ResearchFrontierOrigin) => {
    const key = `${item.causalNode}\u0000${item.question}`.trim().toLocaleLowerCase()
    if (!key || seen.has(key)) return null
    seen.add(key)
    return { ...item, origin }
  }
  const analyst = analystFrontier.flatMap((item) => {
    const next = add(item, 'analyst')
    return next ? [next] : []
  })
  if (critique.verdict !== 'needs_revision') return analyst
  const critic = critique.requiredResearch.flatMap((requirement) => {
    const question = requirement.trim()
    const next = add({
      question,
      causalNode: 'adversarial review',
      priority: 5,
      sourceTypes: ['primary or regulatory source'],
      evidenceNeeded: `Resolve the critic requirement: ${question}`,
    }, 'critic')
    return next ? [next] : []
  })
  return [...analyst, ...critic].slice(0, 16)
}

async function persistFrontier(hypothesisId: string, researchVersionId: string, frontier: PersistedResearchFrontierInput[]): Promise<void> {
  if (frontier.length === 0) return
  const supabase = getSupabaseClient()!
  const { error } = await supabase.from('market_hypothesis_research_frontier').insert(frontier.map((item) => ({
    hypothesis_id: hypothesisId, research_version_id: researchVersionId, question: item.question, causal_node: item.causalNode, priority: item.priority, source_types: item.sourceTypes, status: 'queued', evidence_needed: item.evidenceNeeded,
    adapter_id: item.origin === 'critic' ? 'critic' : null,
  })))
  if (error) throw new Error(`Unable to persist market research frontier: ${error.message}`)
}

export interface DeepenMarketHypothesisOptions {
  ownerId: string
  hypothesisId: string
  reason?: string
  researchRunner?: (prompt: string) => Promise<CodexExecResult<MarketHypothesisResearchContent>>
  criticRunner?: (prompt: string) => Promise<CodexExecResult<MarketHypothesisCritique>>
}

/**
 * A critique that requests revision is a durable research frontier, not a
 * license to spend another strong-model pass on the same evidence. Scheduled
 * work reopens only for an initial artifact or new linked evidence. An
 * operator may still explicitly request a revision when they have resolved a
 * frontier outside the automated source path.
 */
export function shouldQueueMarketHypothesisResearch(
  latestStatus: string | null,
  newLinkedObservationCount: number,
): boolean {
  return latestStatus === null || newLinkedObservationCount > 0
}

export interface ResearchFrontierScoutInput {
  id: string
  question: string
  causalNode: string
  priority: number
  sourceTypes: string[]
  evidenceNeeded: string
}

export interface ResearchFrontierScoutPlan {
  domainId: string
  frontierIds: string[]
  reason: string
}

/**
 * Frontier routing requests broad, citation-required research leads. It does
 * not create evidence or source authority: recurring sources discovered there
 * still need separate promotion, contract, and health checks.
 */
export function buildResearchFrontierScoutPlan(
  domainId: string,
  frontiers: ResearchFrontierScoutInput[],
): ResearchFrontierScoutPlan | null {
  const domain = getMarketDomainPack(domainId)
  if (!domain) return null
  const selected = [...frontiers]
    .filter((item) => item.id && item.question.trim() && item.evidenceNeeded.trim())
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
    .slice(0, 3)
  if (selected.length === 0) return null
  const questions = selected.map((item, index) => {
    const sourceTypes = item.sourceTypes.filter(Boolean).slice(0, 6).join(', ') || 'authoritative primary or regulatory sources'
    return `${index + 1}. Causal node: ${item.causalNode}. Question: ${item.question}. Evidence needed: ${item.evidenceNeeded}. Preferred source classes: ${sourceTypes}.`
  }).join('\n')
  return {
    domainId,
    frontierIds: selected.map((item) => item.id),
    reason: [
      `Research-frontier investigation for ${domain.label}. Find a compact, diverse lead dossier that can reduce the bounded gaps below, including primary evidence and credible counter-evidence.`,
      'This is broad research, not a conclusion. Every lead needs an attributable URL and quote. It cannot become a market observation or automatically create a source contract; recurring sources require separate promotion, contract, and health checks.',
      questions,
    ].join('\n\n').slice(0, 6_000),
  }
}

interface PersistedResearchFrontier extends ResearchFrontierScoutInput {
  domainId: string
}

function normalizePersistedResearchFrontier(value: unknown): PersistedResearchFrontier | null {
  const row = record(value)
  const hypothesis = record(row.market_hypotheses)
  const id = typeof row.id === 'string' ? row.id : ''
  const domainId = typeof hypothesis.scope === 'string' ? hypothesis.scope : ''
  const question = typeof row.question === 'string' ? row.question : ''
  const causalNode = typeof row.causal_node === 'string' ? row.causal_node : ''
  const evidenceNeeded = typeof row.evidence_needed === 'string' ? row.evidence_needed : ''
  if (!id || !domainId || !question || !causalNode || !evidenceNeeded) return null
  return { id, domainId, question, causalNode, priority: number(row.priority), sourceTypes: strings(row.source_types), evidenceNeeded }
}

/** Return one bounded scout plan per known domain from queued research gaps. */
export async function findQueuedResearchFrontierScoutPlans(limit = 8): Promise<ResearchFrontierScoutPlan[]> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase
    .from('market_hypothesis_research_frontier')
    .select('id,question,causal_node,priority,source_types,evidence_needed,market_hypotheses!inner(scope)')
    .eq('status', 'queued')
    .order('priority', { ascending: false })
    .limit(Math.max(1, Math.min(limit * 6, 48)))
  if (error) throw new Error(`Unable to load queued research frontiers: ${error.message}`)
  const byDomain = new Map<string, ResearchFrontierScoutInput[]>()
  for (const row of data ?? []) {
    const frontier = normalizePersistedResearchFrontier(row)
    if (!frontier || !getMarketDomainPack(frontier.domainId)) continue
    byDomain.set(frontier.domainId, [...(byDomain.get(frontier.domainId) ?? []), frontier])
  }
  return [...byDomain.entries()]
    .map(([domainId, frontiers]) => buildResearchFrontierScoutPlan(domainId, frontiers))
    .filter((plan): plan is ResearchFrontierScoutPlan => plan !== null)
    .slice(0, Math.max(1, Math.min(limit, 12)))
}

/** Deferred means candidate discovery is queued; it is not evidence completion. */
export async function deferResearchFrontiersForScout(frontierIds: string[], sourceScoutJobId: string): Promise<void> {
  if (frontierIds.length === 0) return
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { error } = await supabase.from('market_hypothesis_research_frontier').update({
    status: 'deferred', adapter_id: `world-source-scout:${sourceScoutJobId}`, next_run_at: null, updated_at: new Date().toISOString(),
  }).in('id', frontierIds).eq('status', 'queued')
  if (error) throw new Error(`Unable to defer research frontiers for source scouting: ${error.message}`)
}

/**
 * Evidence received from a governed, human-reviewed source is only resolved
 * after a bounded research + critic pass has assessed it. A critic that finds
 * another gap persists fresh queued frontier work rather than reopening this
 * already-assessed evidence item.
 */
export async function completeEvidenceReceivedResearchFrontiers(hypothesisId: string, researchVersionId: string): Promise<number> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data, error } = await supabase.from('market_hypothesis_research_frontier').update({
    status: 'complete', adapter_id: `assessed-by-research:${researchVersionId}`, updated_at: new Date().toISOString(),
  }).eq('hypothesis_id', hypothesisId).eq('status', 'evidence_received').select('id')
  if (error) throw new Error(`Unable to complete assessed evidence frontiers: ${error.message}`)
  return data?.length ?? 0
}

export async function deepenMarketHypothesis(options: DeepenMarketHypothesisOptions): Promise<MarketHypothesisResearchVersion> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { hypothesis, sources, prior } = await loadResearchContext(options.ownerId, options.hypothesisId)
  if (sources.length < 3) throw new Error('A market hypothesis needs at least three source-backed observations before deep research')
  const allowedSourceIds = new Set(sources.map((source) => source.documentId))
  const sourceWithExcerpt = await Promise.all(sources.slice(0, 10).map(async (source) => ({
    ...source,
    excerpt: source.extractedKey ? await readWorldCorpusExtract(source.extractedKey, 7_000).catch(() => `${source.title}\n${source.assertion}`) : `${source.title}\n${source.assertion}`,
  })))
  const version = (prior?.version ?? 0) + 1
  const now = new Date().toISOString()
  const { data: row, error: createError } = await supabase.from('market_hypothesis_research_versions').insert({
    hypothesis_id: hypothesis.id, version, status: 'running', source_ids: [...allowedSourceIds], observation_ids: sources.map((source) => source.observationId), prior_research_version_id: prior?.id ?? null, data_as_of: now,
  }).select('*').single()
  if (createError || !row) throw new Error(`Unable to create market research artifact: ${createError?.message ?? 'unknown error'}`)
  try {
    const researchRunner = options.researchRunner ?? ((prompt) => runCodexJson({ prompt, schemaPath: 'schemas/market-thesis-research.schema.json', validate: (value) => validateMarketThesisResearch(value, allowedSourceIds), model: selectMarketModel('hypothesis_analysis').model, timeoutMs: 20 * 60 * 1_000 }))
    const criticRunner = options.criticRunner ?? ((prompt) => runCodexJson({ prompt, schemaPath: 'schemas/market-thesis-critique.schema.json', validate: (value) => validateMarketThesisCritique(value, allowedSourceIds), model: selectMarketModel('hypothesis_critic').model, timeoutMs: 12 * 60 * 1_000 }))
    const researchResult = await researchRunner(researchPrompt(hypothesis, sourceWithExcerpt, prior, options.reason ?? 'scheduled deepening'))
    const research = validateMarketThesisResearch(researchResult.data, allowedSourceIds)
    const critiqueResult = await criticRunner(critiquePrompt(hypothesis, research, sources))
    const critique = validateMarketThesisCritique(critiqueResult.data, allowedSourceIds)
    const status = critique.verdict === 'pass' ? 'complete' : 'needs_revision'
    const generatedAt = new Date().toISOString()
    const { error: updateError } = await supabase.from('market_hypothesis_research_versions').update({
      status, content: research, critique, source_ids: research.sourceIds, revision_diff: revisionDiff(prior, research), provider: researchResult.metadata.provider, model: researchResult.metadata.model,
      critic_provider: critiqueResult.metadata.provider, critic_model: critiqueResult.metadata.model, critic_generated_at: generatedAt, generated_at: generatedAt, error: null,
    }).eq('id', row.id).eq('status', 'running')
    if (updateError) throw new Error(`Unable to publish market research artifact: ${updateError.message}`)
    await persistFrontier(hypothesis.id, row.id, buildPersistedResearchFrontier(research.researchFrontier, critique))
    await completeEvidenceReceivedResearchFrontiers(hypothesis.id, String(row.id))
    return { id: row.id, hypothesisId: hypothesis.id, version, status, content: research, critique, sourceIds: research.sourceIds, observationIds: sources.map((source) => source.observationId), priorResearchVersionId: prior?.id ?? null, revisionDiff: revisionDiff(prior, research), provider: researchResult.metadata.provider, model: researchResult.metadata.model, criticProvider: critiqueResult.metadata.provider, criticModel: critiqueResult.metadata.model, criticGeneratedAt: generatedAt, dataAsOf: now, generatedAt, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase.from('market_hypothesis_research_versions').update({ status: 'failed', error: message }).eq('id', row.id)
    throw error
  }
}

/**
 * Select research that actually needs another bounded pass. This is deliberately
 * deterministic: an initial artifact or new linked observations may trigger
 * work; a calendar tick or an unchanged unfinished critique may not.
 */
export async function findDueMarketHypothesisResearch(ownerId?: string, limit = 12): Promise<Array<{
  ownerId: string
  hypothesisId: string
  reason: string
}>> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  let query = supabase
    .from('market_hypotheses')
    .select('id,owner_id,status,market_hypothesis_research_versions(version,status,data_as_of,generated_at)')
    .in('status', ['forming', 'proposed', 'active'])
    .order('updated_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 40)))
  if (ownerId) query = query.eq('owner_id', ownerId)
  const { data: hypotheses, error } = await query
  if (error) throw new Error(`Unable to inspect due market research: ${error.message}`)
  const due: Array<{ ownerId: string; hypothesisId: string; reason: string }> = []
  for (const hypothesis of hypotheses ?? []) {
    const versions = records(hypothesis.market_hypothesis_research_versions)
      .sort((left, right) => number(right.version) - number(left.version))
    const latest = versions[0]
    if (!latest) {
      due.push({ ownerId: String(hypothesis.owner_id), hypothesisId: String(hypothesis.id), reason: 'initial source-backed analysis' })
      continue
    }
    const since = typeof latest.generated_at === 'string' ? latest.generated_at : latest.data_as_of
    const { count, error: evidenceError } = await supabase
      .from('market_hypothesis_evidence')
      .select('observation_id,world_observations!inner(ingested_at)', { count: 'exact', head: true })
      .eq('hypothesis_id', hypothesis.id)
      .gt('world_observations.ingested_at', since)
    if (evidenceError) throw new Error(`Unable to inspect new market evidence: ${evidenceError.message}`)
    if (shouldQueueMarketHypothesisResearch(String(latest.status), count ?? 0)) {
      due.push({ ownerId: String(hypothesis.owner_id), hypothesisId: String(hypothesis.id), reason: `${count} linked observation${count === 1 ? '' : 's'} arrived after the prior research version` })
    }
  }
  return due.slice(0, Math.max(1, Math.min(limit, 40)))
}
