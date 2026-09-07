import { investmentDb, record, contentHash } from './recommendations.ts'
import {
  validateLearningRegistration,
  type LearningRegistration,
} from '../markets/investment-learning.ts'
export async function registerInvestmentExperiment(
  ownerId: string,
  input: Record<string, unknown>,
  now = new Date(),
) {
  const db = investmentDb()
  const prior = await db
    .from('recommendation_policy_experiments')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .eq('event_type', 'registered')
  if (prior.error) throw new Error(prior.error.message)
  const registration = validateLearningRegistration(
    {
      ...input,
      trialNumber: (prior.count ?? 0) + 1,
    } as unknown as LearningRegistration,
    now,
  )
  const result = await db
    .from('recommendation_policy_experiments')
    .insert({
      owner_id: ownerId,
      event_type: 'registered',
      policy_key: registration.candidatePolicy,
      content: {
        ...registration,
        registeredAt: now.toISOString(),
        hash: contentHash(registration),
        status: 'shadow_only',
        prohibition:
          'Does not change the active capital policy or place orders',
      },
    })
    .select('id')
    .single()
  if (result.error) throw new Error(result.error.message)
  return result.data
}
export async function reviewInvestmentExperiment(
  ownerId: string,
  input: Record<string, unknown>,
) {
  const db = investmentDb(),
    id = String(input.experimentId),
    event = String(input.eventType)
  if (
    !['reviewed', 'rejected', 'rolled_back'].includes(event) ||
    String(input.rationale ?? '').length < 20
  )
    throw new Error(
      'Experiment review needs a disposition and substantive rationale',
    )
  const experiment = await db
    .from('recommendation_policy_experiments')
    .select('*')
    .eq('id', id)
    .eq('owner_id', ownerId)
    .eq('event_type', 'registered')
    .single()
  if (experiment.error) throw new Error('Registered owner experiment not found')
  const result = await db
    .from('recommendation_policy_experiments')
    .insert({
      owner_id: ownerId,
      parent_id: id,
      event_type: event,
      policy_key: experiment.data.policy_key,
      content: {
        rationale: input.rationale,
        registration: record(experiment.data.content),
        evidence: input.evidence ?? [],
        authority:
          'Owner review; active code/policy changes require separately tested deployment',
      },
    })
    .select('id')
    .single()
  if (result.error) throw new Error(result.error.message)
  return result.data
}
