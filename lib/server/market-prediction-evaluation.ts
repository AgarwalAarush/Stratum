import type { MarketThesisPredictionEvaluation } from '../markets/types.ts'
import { runCodexJson, type CodexExecResult } from './codex-exec.ts'
import { selectMarketModel } from './market-model-policy.ts'
import { readWorldCorpusExtract } from './world-corpus.ts'
import { getSupabaseClient } from './supabase.ts'
import { predictionHorizonDays } from '../markets/prediction-horizon.ts'

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) : []
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${label}`)
  return value.trim()
}

export function predictionDeadlineFromHorizon(horizon: string, startAt: Date): string | null {
  const days = predictionHorizonDays(horizon)
  if (days === null || days < 1 || days > 3652) return null
  return new Date(startAt.getTime() + Math.round(days * 24 * 60 * 60 * 1_000)).toISOString()
}

/** A missed deadline with no new governed evidence is a durable, deterministic
 * inconclusive outcome. Do not spend a model call to manufacture that fact. */
export function shouldResolvePredictionDeadlineWithoutModel(deadline: string | null, evidenceCount: number, now = Date.now()): boolean {
  if (evidenceCount !== 0 || deadline === null) return false
  const deadlineAt = Date.parse(deadline)
  return Number.isFinite(deadlineAt) && deadlineAt <= now
}

export interface MarketPredictionEvaluationContent {
  verdict: 'confirmed' | 'disconfirmed' | 'inconclusive'
  rationale: string
  sourceIds: string[]
}

export function validateMarketPredictionEvaluation(value: unknown, allowedSourceIds?: ReadonlySet<string>): MarketPredictionEvaluationContent {
  const output = record(value)
  const verdict = output.verdict
  if (verdict !== 'confirmed' && verdict !== 'disconfirmed' && verdict !== 'inconclusive') throw new Error('Invalid prediction evaluation verdict')
  const sourceIds = strings(output.sourceIds)
  if (sourceIds.length > 10) throw new Error('Prediction evaluation may cite at most ten sources')
  if (verdict !== 'inconclusive' && sourceIds.length < 1) throw new Error('A conclusive prediction evaluation needs source evidence')
  if (allowedSourceIds) {
    const unknown = sourceIds.filter((id) => !allowedSourceIds.has(id))
    if (unknown.length > 0) throw new Error(`Prediction evaluation referenced unknown source IDs: ${unknown.join(', ')}`)
  }
  return { verdict, rationale: requiredString(output.rationale, 'prediction evaluation rationale'), sourceIds }
}

interface EvaluationSource {
  documentId: string
  observationId: string
  title: string
  publisher: string
  url: string
  assertion: string
  mechanism: string
  tier: string
  extractedKey: string | null
}

interface EvaluationContext {
  predictionId: string
  prediction: string
  expectedDirection: string
  evidenceNeeded: string
  deadline: string | null
  hypothesisId: string
  ownerId: string
  sources: EvaluationSource[]
  priorVersion: number
}

async function loadContext(predictionId: string, cutoff = new Date().toISOString()): Promise<EvaluationContext> {
  const supabase = getSupabaseClient()!
  const { data: predictionRow, error: predictionError } = await supabase
    .from('market_thesis_predictions')
    .select('*,market_thesis_versions(hypothesis_id,data_as_of,generated_at)')
    .eq('id', predictionId).maybeSingle()
  if (predictionError || !predictionRow) throw new Error('Market thesis prediction was not found')
  const thesis = record(predictionRow.market_thesis_versions)
  const hypothesisId = requiredString(thesis.hypothesis_id, 'prediction hypothesis ID')
  const { data: hypothesisRow, error: hypothesisError } = await supabase.from('market_hypotheses').select('owner_id').eq('id', hypothesisId).maybeSingle()
  if (hypothesisError || !hypothesisRow) throw new Error('Prediction hypothesis was not found')
  const after = typeof thesis.generated_at === 'string' ? thesis.generated_at : thesis.data_as_of
  const { data: evidenceRows, error: evidenceError } = await supabase
    .from('market_hypothesis_evidence')
    .select('observation_id,world_observations!inner(assertion,mechanism,ingested_at,world_documents(id,title,publisher,canonical_url,source_tier,extracted_key))')
    .eq('hypothesis_id', hypothesisId)
    .gt('world_observations.ingested_at', after)
    .lte('world_observations.ingested_at', cutoff)
    .order('ingested_at', { referencedTable: 'world_observations', ascending: false })
    .limit(50)
  if (evidenceError) throw new Error(`Unable to load post-prediction evidence: ${evidenceError.message}`)
  const sources = (evidenceRows ?? []).flatMap((row) => {
    const observation = record(row.world_observations)
    const document = record(observation.world_documents)
    if (!document.id) return []
    return [{
      documentId: String(document.id), observationId: String(row.observation_id), title: String(document.title), publisher: String(document.publisher),
      url: String(document.canonical_url), assertion: String(observation.assertion), mechanism: String(observation.mechanism), tier: String(document.source_tier),
      extractedKey: typeof document.extracted_key === 'string' ? document.extracted_key : null,
    }]
  })
  const { data: prior, error: priorError } = await supabase.from('market_thesis_prediction_evaluations').select('version').eq('prediction_id', predictionId).order('version', { ascending: false }).limit(1).maybeSingle()
  if (priorError) throw new Error(`Unable to inspect prior prediction evaluation: ${priorError.message}`)
  return {
    predictionId, prediction: String(predictionRow.prediction), expectedDirection: String(predictionRow.expected_direction), evidenceNeeded: String(predictionRow.evidence_needed),
    deadline: predictionRow.deadline === null ? null : String(predictionRow.deadline), hypothesisId, ownerId: String(hypothesisRow.owner_id), sources, priorVersion: Number(prior?.version ?? 0),
  }
}

function evaluationPrompt(context: EvaluationContext, sources: Array<EvaluationSource & { excerpt: string }>): string {
  return [
    'You are Stratum\'s bounded prediction evaluator. Judge one stored market-model prediction only against the supplied post-prediction evidence ledger.',
    'Use confirmed when the evidence materially satisfies its stated confirmation condition; disconfirmed when it materially satisfies its stated disconfirmation condition; otherwise return inconclusive. Do not make recommendations, create a new thesis, infer prices, or use outside knowledge. Inconclusive is the correct answer for inadequate or mixed evidence.',
    `PREDICTION: ${context.prediction}`,
    `EXPECTED DIRECTION: ${context.expectedDirection}`,
    `LEADING EVIDENCE NEEDED: ${context.evidenceNeeded}`,
    `DEADLINE: ${context.deadline ?? 'none'}`,
    `ALLOWED SOURCE IDS: ${sources.map((source) => source.documentId).join(', ') || 'none'}`,
    `POST-PREDICTION EVIDENCE: ${JSON.stringify(sources)}`,
  ].join('\n\n')
}

function normalizeEvaluation(row: RecordValue): MarketThesisPredictionEvaluation {
  const verdict = row.verdict as MarketThesisPredictionEvaluation['verdict']
  return {
    id: String(row.id), predictionId: String(row.prediction_id), version: Number(row.version), status: row.status as MarketThesisPredictionEvaluation['status'], verdict,
    rationale: String(row.rationale ?? ''), sourceIds: strings(row.source_ids), observationIds: strings(row.observation_ids),
    provider: row.provider === null ? null : String(row.provider ?? ''), model: row.model === null ? null : String(row.model ?? ''), dataAsOf: String(row.data_as_of),
    generatedAt: row.generated_at === null ? null : String(row.generated_at ?? ''), error: row.error === null ? null : String(row.error ?? ''),
  }
}

export interface EvaluateMarketPredictionOptions {
  predictionId: string
  runner?: (prompt: string) => Promise<CodexExecResult<MarketPredictionEvaluationContent>>
}

export async function evaluateMarketPrediction(options: EvaluateMarketPredictionOptions): Promise<{ evaluation: MarketThesisPredictionEvaluation; hypothesisId: string; ownerId: string }> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const context = await loadContext(options.predictionId)
  const sourceIds = new Set(context.sources.map((source) => source.documentId))
  const now = new Date().toISOString()
  const { data: row, error: createError } = await supabase.from('market_thesis_prediction_evaluations').insert({
    prediction_id: context.predictionId, version: context.priorVersion + 1, status: 'running', verdict: 'inconclusive',
    source_ids: [], observation_ids: context.sources.map((source) => source.observationId), data_as_of: now,
  }).select('*').single()
  if (createError || !row) throw new Error(`Unable to create prediction evaluation: ${createError?.message ?? 'unknown error'}`)
  try {
    if (shouldResolvePredictionDeadlineWithoutModel(context.deadline, context.sources.length)) {
      const generatedAt = new Date().toISOString()
      const rationale = 'The prediction deadline elapsed without any new linked governed observation, so the outcome is inconclusive rather than inferred.'
      const { data: updated, error: updateError } = await supabase.from('market_thesis_prediction_evaluations').update({
        status: 'complete', verdict: 'inconclusive', rationale, generated_at: generatedAt, error: null,
      }).eq('id', row.id).eq('status', 'running').select('*').single()
      if (updateError || !updated) throw new Error(`Unable to publish deterministic prediction expiry: ${updateError?.message ?? 'unknown error'}`)
      const { error: predictionUpdateError } = await supabase.from('market_thesis_predictions').update({ result: 'expired', evaluated_at: generatedAt }).eq('id', context.predictionId)
      if (predictionUpdateError) throw new Error(`Unable to expire prediction: ${predictionUpdateError.message}`)
      return { evaluation: normalizeEvaluation(updated as RecordValue), hypothesisId: context.hypothesisId, ownerId: context.ownerId }
    }
    const sourceWithExcerpt = await Promise.all(context.sources.slice(0, 10).map(async (source) => ({
      ...source, excerpt: source.extractedKey ? await readWorldCorpusExtract(source.extractedKey, 5_000).catch(() => `${source.title}\n${source.assertion}`) : `${source.title}\n${source.assertion}`,
    })))
    const runner = options.runner ?? ((prompt: string) => runCodexJson({
      prompt, schemaPath: 'schemas/market-prediction-evaluation.schema.json', model: selectMarketModel('prediction_evaluation').model,
      validate: (value) => validateMarketPredictionEvaluation(value, sourceIds), timeoutMs: 10 * 60 * 1_000,
    }))
    const result = await runner(evaluationPrompt(context, sourceWithExcerpt))
    const content = validateMarketPredictionEvaluation(result.data, sourceIds)
    const generatedAt = new Date().toISOString()
    const { data: updated, error: updateError } = await supabase.from('market_thesis_prediction_evaluations').update({
      status: 'complete', verdict: content.verdict, rationale: content.rationale, source_ids: content.sourceIds,
      provider: result.metadata.provider, model: result.metadata.model, generated_at: generatedAt, error: null,
    }).eq('id', row.id).eq('status', 'running').select('*').single()
    if (updateError || !updated) throw new Error(`Unable to publish prediction evaluation: ${updateError?.message ?? 'unknown error'}`)
    const expired = content.verdict === 'inconclusive' && context.deadline !== null && Date.parse(context.deadline) <= Date.now()
    const { error: predictionUpdateError } = await supabase.from('market_thesis_predictions').update({
      result: expired ? 'expired' : content.verdict === 'inconclusive' ? 'pending' : content.verdict,
      evaluated_at: generatedAt,
    }).eq('id', context.predictionId)
    if (predictionUpdateError) throw new Error(`Unable to update prediction status: ${predictionUpdateError.message}`)
    return { evaluation: normalizeEvaluation(updated as RecordValue), hypothesisId: context.hypothesisId, ownerId: context.ownerId }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase.from('market_thesis_prediction_evaluations').update({ status: 'failed', error: message }).eq('id', row.id)
    throw error
  }
}

/**
 * A prediction is reconsidered only when the linked hypothesis receives new
 * evidence or its explicit deadline passes. A scheduler tick by itself cannot
 * spend a model call repeatedly on unchanged evidence.
 */
export async function findDueMarketPredictionEvaluations(limit = 20): Promise<string[]> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const { data: predictions, error } = await supabase
    .from('market_thesis_predictions')
    .select('id,deadline,market_thesis_versions(hypothesis_id,generated_at,data_as_of)')
    .eq('result', 'pending')
    .order('evaluated_at', { ascending: true, nullsFirst: true })
    .limit(Math.max(1, Math.min(limit, 50)))
  if (error) throw new Error(`Unable to inspect due market predictions: ${error.message}`)
  const now = Date.now()
  const due: string[] = []
  for (const prediction of predictions ?? []) {
    const deadline = prediction.deadline ? Date.parse(String(prediction.deadline)) : Number.NaN
    if (Number.isFinite(deadline) && deadline <= now) {
      due.push(String(prediction.id))
      continue
    }
    const thesis = record(prediction.market_thesis_versions)
    const hypothesisId = typeof thesis.hypothesis_id === 'string' ? thesis.hypothesis_id : ''
    if (!hypothesisId) continue
    const { data: latest, error: latestError } = await supabase.from('market_thesis_prediction_evaluations').select('generated_at,data_as_of').eq('prediction_id', prediction.id).order('version', { ascending: false }).limit(1).maybeSingle()
    if (latestError) throw new Error(`Unable to inspect prediction evaluation history: ${latestError.message}`)
    const since = typeof latest?.generated_at === 'string' ? latest.generated_at : typeof thesis.generated_at === 'string' ? thesis.generated_at : thesis.data_as_of
    const { count, error: evidenceError } = await supabase
      .from('market_hypothesis_evidence')
      .select('observation_id,world_observations!inner(ingested_at)', { count: 'exact', head: true })
      .eq('hypothesis_id', hypothesisId)
      .gt('world_observations.ingested_at', since)
    if (evidenceError) throw new Error(`Unable to inspect new prediction evidence: ${evidenceError.message}`)
    if ((count ?? 0) > 0) due.push(String(prediction.id))
  }
  return due
}
