import { resolve } from 'node:path'
import type { DecisionContext, Recommendation } from '../markets/recommendations.ts'
import { frozenPrimaryPacket } from '../markets/frozen-primary-evidence.ts'
import { evidenceOnlyProbability } from '../markets/research-baselines.ts'
import { selectAblationQuestions, validateAblationAnswers } from '../markets/world-ablation.ts'
import { withDecisionInputs } from './decision-inputs.ts'
import { runCodexJson } from './codex-exec.ts'
import { AI_MODELS } from '../ai/config.ts'

export async function runSimpleBaseline(context: DecisionContext, recs: Recommendation[], policy: string) {
  const questions = selectAblationQuestions(recs, context.cutoff)
  const comparisons = [], exclusions = [], metadata = []
  for (const question of questions) {
    const rec = recs.find(r => r.symbol === question.symbol && r.portfolioId === question.portfolioId)!
    const baseline = {key: question.key, probability: rec.forecasts[question.ordinal].probability, reason: 'Issued expensive research probability', sourceIds: rec.forecasts[question.ordinal].sourceIds}
    try {
      const frozen = frozenPrimaryPacket(context, question.symbol, question.portfolioId)
      let candidate
      if (policy === 'evidence-only-v1') candidate = {key: question.key, ...evidenceOnlyProbability(frozen.packet, question), sourceIds: [frozen.evidenceId]}
      else {
        const result = await withDecisionInputs({...context, world: [], portfolio: null, market: null, names: [], universe: [], evidence: [{...context.evidence.find(e => e.id === frozen.evidenceId)!, value: frozen.packet}]}, input => runCodexJson({cwd: input.directory, webSearch: false, schemaPath: resolve('schemas/world-ablation.schema.json'), model: AI_MODELS.articleSummary, timeoutMs: 3*60_000,
          prompt: `Make one short, cited estimate of this exact economic question from the frozen primary packet. No full report, World memory, prior research or original probability. Return null if insufficient. Do not fetch anything. QUESTION ${JSON.stringify(question)}\n${input.prompt}`,
          validate: v => validateAblationAnswers(v, [question.key], new Set([frozen.evidenceId]))}),{includeCriticSchema:false})
        candidate = result.data[0]; metadata.push(result.metadata)
      }
      if (candidate.probability === null) exclusions.push({question, baseline, candidate})
      else comparisons.push({question, baseline, candidate})
    } catch (error) { exclusions.push({question, reason: error instanceof Error ? error.message : String(error)}) }
  }
  return {questions, comparisons, exclusions, metadata, method: `${policy}: same frozen primary packet and exact question; no World context or issued research narrative. Prospective preregistration required; exclusions retained.`, modelCalls: metadata.length}
}
