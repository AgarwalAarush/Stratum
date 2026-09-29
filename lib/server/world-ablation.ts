import { resolve } from 'node:path'
import type { DecisionContext, Recommendation } from '../markets/recommendations.ts'
import { selectAblationQuestions, validateAblationAnswers, withoutWorldContext } from '../markets/world-ablation.ts'
import { withDecisionInputs } from './decision-inputs.ts'
import { runCodexJson } from './codex-exec.ts'
import { selectMarketModel } from './market-model-policy.ts'

export async function runWorldAblation(context: DecisionContext, recommendations: Recommendation[]) {
  const questions = selectAblationQuestions(recommendations, context.cutoff)
  if (!questions.length) return { comparisons: [], exclusions: [], questions, metadata: [] }
  const arms = []
  for (const withWorld of [false, true]) {
    const arm = withWorld ? context : withoutWorldContext(context)
    // Freeze the same predeclared six-name selection for both arms. Do not
    // show either arm the published probabilities or the other arm's answers.
    const selected = { ...arm, names: arm.names.filter(n => questions.some(q => q.symbol === n.symbol && q.portfolioId === n.portfolioId)) }
    arms.push(await withDecisionInputs(selected, input => runCodexJson({
      schemaPath: resolve('schemas/world-ablation.schema.json'), cwd: input.directory, webSearch: false,
      timeoutMs: 4 * 60_000, model: selectMarketModel('hypothesis_analysis').model,
      validate: value => validateAblationAnswers(value, questions.map(q => q.key), new Set(arm.evidence.map(e => e.id))),
      prompt: `Estimate the probability of each frozen economic question using the supplied evidence. Return null with an explained gap if evidence is insufficient. Do not change questions, thresholds, periods, or deadlines. Do not recommend an action, fetch new evidence or access any other directory. You are one blinded arm of a prospective comparison; no original forecast probability is supplied. Cite evidence IDs.\nQUESTIONS\n${JSON.stringify(questions)}\n${input.prompt}`,
    })))
  }
  const comparisons = [], exclusions = []
  for (const q of questions) {
    const baseline = arms[0].data.find(a => a.key === q.key)!
    const candidate = arms[1].data.find(a => a.key === q.key)!
    if (baseline.probability === null || candidate.probability === null) {
      exclusions.push({ question: q, baseline, candidate })
      continue
    }
    comparisons.push({ question: q, baseline, candidate })
  }
  return { comparisons, exclusions, questions, metadata: arms.map(a => a.metadata),
    method: 'Company evidence alone versus the same evidence plus explicit World context. Six first eligible symbols per daily edition; one 95-day-or-shorter question per symbol. Embedded World influence in prior company research is not removed. No capital-action comparison or causal alpha claim.' }
}
