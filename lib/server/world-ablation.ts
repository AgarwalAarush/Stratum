import { resolve, join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import type { DecisionContext, Recommendation } from '../markets/recommendations.ts'
import { rebuiltResearchSchema, selectAblationQuestions, validateAblationAnswers } from '../markets/world-ablation.ts'
import { frozenPrimaryPacket } from '../markets/frozen-primary-evidence.ts'
import { withDecisionInputs } from './decision-inputs.ts'
import { runCodexJson } from './codex-exec.ts'
import { selectMarketModel } from './market-model-policy.ts'
import { contentHash } from './recommendations.ts'
import { researchPrompt, validateEquityResearch } from './company-research.ts'
import { etfResearchPrompt, validateEtfResearch } from './etf-research.ts'
import { companyMarketModelPrompt, validateCompanyMarketModel } from './company-market-model.ts'
import { currentWorldVersions } from '../markets/evidence-authority.ts'
import { getSupabaseClient } from './supabase.ts'

export async function runWorldAblation(context: DecisionContext, recommendations: Recommendation[]) {
  const questions = selectAblationQuestions(recommendations, context.cutoff)
  const comparisons = [], exclusions = [], metadata = [], rebuiltResearch = []
  // Freeze fallible World hypotheses separately for this registered shadow trial.
  // They never enter or mutate the canonical recommendation manifest.
  const db = getSupabaseClient()
  const captured = db && questions.length ? await db.from('causal_model_versions').select('*').eq('source_kind','world_node').lte('created_at',context.cutoff).lte('as_of',context.cutoff).order('created_at',{ascending:false}).limit(1001) : null
  const bounded = captured && !captured.error && captured.data.length < 1001
  const world = bounded ? currentWorldVersions(captured.data,context.cutoff).filter(row => ['active','monitoring','shadow'].includes(String(row.state))).map(row => ({id:`shadow-world:${row.id}`,kind:'shadow_comparison_context',value:{...row,authority:'shadow',mayAuthorizeCapital:false},asOf:String(row.as_of),availableAt:String(row.created_at),retrievedAt:new Date().toISOString(),url:null,feed:null,hash:contentHash(row)})) : []
  for (const question of questions) {
    if (!world.length) {exclusions.push({question, reason: 'No frozen World analytical context: no meaningful ablation is available'}); continue}
    try {
      const frozen = frozenPrimaryPacket(context, question.symbol, question.portfolioId)
      const company = 'company' in frozen.packet
      const allowed = new Set(frozen.packet.sources.map(s => s.id))
      const arms = []
      for (const withWorld of [false, true]) {
        const evidence = [{...context.evidence.find(e => e.id === frozen.evidenceId)!, value: frozen.packet}, ...(withWorld ? world : [])]
        // No prior report, business model, accepted thesis, recommendation,
        // portfolio or price expectation can carry World influence between arms.
        const clean = {...context, world: withWorld ? world.map(e => e.value) : [], names: [], portfolio: null, market: null, universe: [], evidence}
        const result = await withDecisionInputs(clean, async input => {
          const [researchSchema, answerSchema] = await Promise.all([
            readFile(resolve(company ? 'schemas/company-research-bundle.schema.json' : 'schemas/etf-research.schema.json'),'utf8'),
            readFile(resolve('schemas/world-ablation.schema.json'),'utf8'),
          ])
          const schemaPath = join(input.directory,'rebuilt-research-schema.json')
          await writeFile(schemaPath,JSON.stringify(rebuiltResearchSchema(JSON.parse(researchSchema),JSON.parse(answerSchema),company)),{mode:0o600})
          return runCodexJson({
          schemaPath, cwd: input.directory, webSearch: false,
          timeoutMs: 12*60_000, model: selectMarketModel('hypothesis_analysis').model,
          prompt: `Rebuild research from the supplied primary packet. No previous report or original forecast probability is available. ${withWorld ? 'World context is a fallible analytical hypothesis, never independent source fact.' : 'Use primary evidence alone.'} Produce the rebuilt report and estimate this exact question in the same response. Do not change its period, unit, threshold or deadline. answers cite frozen evidence IDs; research cites packet source IDs. No capital action or external fetch. QUESTION ${JSON.stringify(question)}\n${company ? `${companyMarketModelPrompt(frozen.packet as import('../markets/types.ts').CompanyPacket, null, 'shadow primary rebuild')}\n${researchPrompt(frozen.packet as import('../markets/types.ts').CompanyPacket, null, null, 'shadow primary rebuild')}` : etfResearchPrompt(frozen.packet as import('../markets/types.ts').EtfResearchPacket, null, 'shadow primary rebuild')}\n${input.prompt}`,
          validate: value => {
            const v = value as Record<string, unknown>
            const research = company ? validateEquityResearch(v.research, [...allowed]) : validateEtfResearch(v.research, frozen.packet as import('../markets/types.ts').EtfResearchPacket)
            const marketModel = company ? validateCompanyMarketModel(v.marketModel, allowed) : null
            const answers = validateAblationAnswers(v, [question.key], new Set(evidence.map(e => e.id)))
            return {research, marketModel, answers}
          },
        })},{includeCriticSchema:false})
        arms.push(result.data.answers[0])
        metadata.push(result.metadata)
        rebuiltResearch.push({questionKey: question.key, arm: withWorld ? 'world' : 'primary_only', primaryPacketHash: contentHash(frozen.packet), capturedAt: frozen.capturedAt, cutoff: context.cutoff, research: result.data.research, marketModel: result.data.marketModel})
      }
      if (arms.some(a => a.probability === null)) exclusions.push({question, baseline: arms[0], candidate: arms[1]})
      else comparisons.push({question, baseline: arms[0], candidate: arms[1]})
    } catch (error) {exclusions.push({question, reason: error instanceof Error ? error.message : String(error)})}
  }
  return {comparisons, exclusions, questions, metadata, rebuiltResearch, frozenWorldEvidence:world, worldCaptureGap:bounded ? null : captured?.error?.message ?? 'World comparison capture unavailable or exceeds its explicit 1,000-version bound', modelCalls: metadata.length,
    method: 'world-context-ablation-v2: independently rebuilt research from identical hashed frozen primary packets; prior research, models, World dossiers and owner thesis removed before generation. Only candidate receives frozen World analytical hypotheses. Question selection may reflect existing coverage; this is not a capital-action or causal alpha trial.'}
}
