// Historical specialist-schema compatibility only. Independent specialist generation
// was retired; the bounded World analyst and critic consume the primary ledger.
import type { WorldSpecialistLens } from '../markets/world-attention.ts'
import type { WorldUpdateProposal } from '../markets/world-thinker-types.ts'

export function boundWorldSpecialistLenses(lenses: WorldSpecialistLens[], trigger: WorldUpdateProposal['trigger']): WorldSpecialistLens[] {
  const limit = trigger === 'urgent' ? 1 : 2
  return [...new Set(lenses)].slice(0, limit)
}

function constrainedStringArray(ids: string[]): Record<string, unknown> {
  const unique = [...new Set(ids)]
  return {
    type: 'array',
    maxItems: unique.length === 0 ? 0 : 100,
    items: unique.length === 0 ? { type: 'string' } : { type: 'string', enum: unique },
  }
}

export function buildWorldSpecialistAssessmentSchema(
  source: Record<string, unknown>,
  lens: WorldSpecialistLens,
  allowed: { eventClusterIds: string[]; sourceIds: string[]; signalIds: string[] },
): Record<string, unknown> {
  const schema = structuredClone(source) as {
    properties: Record<string, Record<string, unknown>>
  }
  schema.properties.lens = { enum: [lens] }
  schema.properties.eventClusterIds = constrainedStringArray(allowed.eventClusterIds)
  schema.properties.sourceIds = constrainedStringArray(allowed.sourceIds)
  schema.properties.relatedSignalIds = constrainedStringArray(allowed.signalIds)
  const classifications = schema.properties.classifications as { items: { properties: Record<string, unknown> } }
  classifications.items.properties.eventClusterId = { type: 'string', enum: [...new Set(allowed.eventClusterIds)] }
  const causalChannels = schema.properties.causalChannels as { items: { properties: Record<string, unknown> } }
  causalChannels.items.properties.sourceIds = constrainedStringArray(allowed.sourceIds)
  return schema
}
