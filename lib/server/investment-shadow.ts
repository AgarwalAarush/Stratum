import { investmentDb, record, contentHash } from './recommendations.ts'
import {
  applyShadowPolicy,
  evaluateShadowCalibration,
  shadowPolicy,
  type ShadowForecastPair,
} from '../markets/shadow-policy.ts'
import type {
  DecisionContext,
  Recommendation,
} from '../markets/recommendations.ts'

async function allRows(table: string, ownerId: string, column = 'owner_id') {
  const result: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += 500) {
    const response = await investmentDb()
      .from(table)
      .select('*')
      .eq(column, ownerId)
      .order('id')
      .range(offset, offset + 499)
    if (response.error) throw new Error(response.error.message)
    result.push(...response.data)
    if (response.data.length < 500) return result
  }
}
/** Deterministic transforms see only the issued frozen advice. Late catch-up
 * after a forecast deadline is ineligible, so it cannot become a retroactive trial. */
export async function captureShadowPolicies(
  batchId: string,
  now = new Date(),
) {
  const db = investmentDb()
  const batch = await db
    .from('recommendation_batches')
    .select('*')
    .eq('id', batchId)
    .single()
  if (batch.error) throw new Error(batch.error.message)
  const ownerId = String(batch.data.owner_id)
  const [manifest, versions, experiments] = await Promise.all([
    db
      .from('recommendation_input_manifests')
      .select('content')
      .eq('id', batch.data.manifest_id)
      .single(),
    allRows('recommendation_versions', batchId, 'batch_id'),
    allRows('recommendation_policy_experiments', ownerId),
  ])
  if (manifest.error) throw new Error(manifest.error.message)
  const context = manifest.data.content as DecisionContext
  const recs = versions.map((r) => r.content as Recommendation)
  let captured = 0
  for (const experiment of experiments.filter(
    (e) => e.event_type === 'registered',
  )) {
    const registration = record(experiment.content)
    if (
      registration.baselinePolicy !== context.policy ||
      Date.parse(String(experiment.created_at)) >
        Date.parse(context.cutoff) ||
      Date.parse(context.cutoff) <
        Date.parse(String(registration.startsAt)) ||
      Date.parse(context.cutoff) > Date.parse(String(registration.endsAt))
    )
      continue
    if (
      experiments.some(
        (e) =>
          e.parent_id === experiment.id &&
          ['rejected', 'rolled_back'].includes(String(e.event_type)),
      )
    )
      continue
    // Legacy free-text registrations have no executable meaning.
    try {
      shadowPolicy(String(experiment.policy_key))
    } catch {
      continue
    }
    const existing = await db
      .from('recommendation_shadow_runs')
      .select('id')
      .eq('experiment_id', experiment.id)
      .eq('batch_id', batchId)
      .maybeSingle()
    if (existing.error) throw new Error(existing.error.message)
    if (existing.data) continue
    if (
      recs.some((r) =>
        r.forecasts.some((f) => Date.parse(f.deadline) <= now.getTime()),
      )
    )
      continue
    const alternative = applyShadowPolicy(String(experiment.policy_key), recs)
    const content = {
      decisionCutoff: context.cutoff,
      codeVersion: context.codeVersion,
      registration,
      baselinePolicy: context.policy,
      comparisons: versions.map((v, i) => ({
        recommendationId: v.id,
        episodeId: v.episode_id,
        securityId: v.security_id,
        issuedAt: v.issued_at,
        baseline: recs[i],
        candidate: alternative[i],
      })),
      authority:
        'Shadow probabilities only; published owner recommendations remain unchanged.',
    }
    const saved = await db
      .from('recommendation_shadow_runs')
      .insert({
        owner_id: ownerId,
        experiment_id: experiment.id,
        batch_id: batchId,
        manifest_id: batch.data.manifest_id,
        policy_key: experiment.policy_key,
        content,
        content_hash: contentHash(content),
      })
    if (saved.error && saved.error.code !== '23505')
      throw new Error(saved.error.message)
    if (!saved.error) captured++
  }
  return { captured }
}

export async function evaluateShadowPolicies(
  ownerId: string,
  now = new Date(),
) {
  const db = investmentDb()
  const [experiments, runs] = await Promise.all([
    allRows('recommendation_policy_experiments', ownerId),
    allRows('recommendation_shadow_runs', ownerId),
  ])
  let evaluated = 0
  for (const experiment of experiments.filter(
    (e) => e.event_type === 'registered',
  )) {
    const registration = record(experiment.content),
      ownRuns = runs.filter((r) => r.experiment_id === experiment.id)
    if (!ownRuns.length) continue
    const pairs: ShadowForecastPair[] = []
    for (const run of ownRuns)
      for (const raw of (record(run.content).comparisons as unknown[]) ??
        []) {
        const comparison = record(raw),
          baseline = comparison.baseline as Recommendation,
          candidate = comparison.candidate as Recommendation
        const assessments = await allRows(
          'recommendation_evaluations',
          String(comparison.recommendationId),
          'recommendation_id',
        )
        baseline.forecasts.forEach((f, index) => {
          const assessment = assessments
            .filter(
              (e) =>
                e.kind === 'thesis' &&
                e.horizon === String(index) &&
                Date.parse(String(e.as_of)) <= now.getTime(),
            )
            .sort((a, b) =>
              String(b.created_at).localeCompare(String(a.created_at)),
            )[0]
          const outcome = record(assessment?.content).outcome
          pairs.push({
            question: JSON.stringify([
              comparison.securityId,
              f.metric,
              f.operator,
              f.threshold,
              f.deadline,
            ]),
            securityId: String(comparison.securityId),
            issuedAt: String(comparison.issuedAt),
            deadline: f.deadline,
            baselineProbability: f.probability,
            candidateProbability: candidate.forecasts[index].probability,
            outcome: typeof outcome === 'boolean' ? outcome : null,
            evaluationId: assessment ? String(assessment.id) : null,
          })
        })
      }
    const assessment = evaluateShadowCalibration(
      pairs,
      Number(registration.embargoDays),
    )
    const content = {
      ...assessment,
      runIds: ownRuns.map((r) => r.id).sort(),
      windowComplete:
        now.getTime() >=
        Date.parse(String(registration.endsAt)) +
          Number(registration.embargoDays) * 86400000,
      minimumEpisodes: registration.minimumEpisodes,
      minimumImprovement: registration.minimumImprovement,
      trialNumber: registration.trialNumber,
      promotionEligible: false,
      promotionReason:
        'Statistical uncertainty, cross-security dependence, multiple testing and explicit owner review must be assessed before any separately tested policy release.',
    }
    const saved = await db
      .from('recommendation_shadow_evaluations')
      .insert({
        owner_id: ownerId,
        experiment_id: experiment.id,
        evaluator_version: 'shadow-calibration-v1',
        content,
        content_hash: contentHash(content),
      })
    if (saved.error && saved.error.code !== '23505')
      throw new Error(saved.error.message)
    if (!saved.error) evaluated++
  }
  return { evaluated }
}
