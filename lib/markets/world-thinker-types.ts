export const WORLD_NODE_KINDS = ['actor', 'situation', 'theme', 'market', 'scenario', 'hypothesis', 'journal', 'current'] as const
export type WorldNodeKind = typeof WORLD_NODE_KINDS[number]

export const WORLD_CLAIM_STATES = ['reported', 'corroborated', 'officially_confirmed', 'contested', 'retracted', 'superseded'] as const
export type WorldClaimState = typeof WORLD_CLAIM_STATES[number]

export type WorldNodeStatus = 'active' | 'monitoring' | 'dormant' | 'superseded' | 'archived'
export type WorldChangeClassification = 'confirmation' | 'contradiction' | 'novelty' | 'noise' | 'uncertainty'

export interface WorldSourceReference {
  id: string
  url: string
  title: string
  publisher?: string
  publishedAt?: string
  claimState: WorldClaimState
  stance: 'supporting' | 'contradicting' | 'neutral'
}

export interface WorldRelationship {
  type: string
  targetId: string
  description: string
}

export interface WorldClaim {
  text: string
  sourceIds: string[]
  assessment?: boolean
}

export interface WorldIndicator {
  id: string
  label: string
  condition: string
  direction: 'higher' | 'lower' | 'crosses' | 'changes'
  threshold?: string
  sourceIds: string[]
}

export interface WorldNode {
  id: string
  kind: WorldNodeKind
  title: string
  status: WorldNodeStatus
  asOf: string
  confidence: number
  importance: number
  aliases: string[]
  relationships: WorldRelationship[]
  sourceIds: string[]
  nextReviewAt: string
  summary: string
  claims: WorldClaim[]
  indicators: WorldIndicator[]
  body: string
  supersedes?: string
  changeSummary?: string
  probabilityRange?: { low: number; high: number; label: 'assessment' }
  signposts?: string[]
  mechanism?: string
  economicVariable?: string
  constrainedLayer?: string
  rentRecipient?: string
  expectationsQuestion?: string
  catalysts?: string[]
  falsifiers?: string[]
}

export interface WorldScenario extends WorldNode {
  kind: 'scenario'
  probabilityRange?: { low: number; high: number; label: 'assessment' }
  signposts: string[]
}

export interface WorldHypothesis extends WorldNode {
  kind: 'hypothesis'
  mechanism: string
  economicVariable: string
  constrainedLayer: string
  rentRecipient: string
  expectationsQuestion: string
  catalysts: string[]
  falsifiers: string[]
}

export interface WorldEventCluster {
  id: string
  fingerprint: string
  title: string
  firstSeenAt: string
  lastSeenAt: string
  eventAt?: string
  actors: string[]
  geographies: string[]
  channels: string[]
  claimState: WorldClaimState
  materiality: number
  novelty: number
  sourceDiversity: number
  thesisDependency: boolean
  portfolioDependency: boolean
  decisiveNewEvent: boolean
  processingState: 'pending' | 'processing' | 'processed' | 'noise' | 'failed' | 'quarantined'
  summary: string
  sourceIds: string[]
}

export interface WorldOpportunityLead {
  id: string
  originatingNodeId: string
  originatingHypothesisId: string
  symbol: string
  issuer: string
  valueChainRole: string
  whatChanged: string
  whyNow: string
  transmissionMechanism: string
  captureMechanism: string
  captureConditions: string[]
  supportingSourceIds: string[]
  contradictingSourceIds: string[]
  evidenceGaps: string[]
  decisiveQuestions: string[]
  catalysts: string[]
  falsifiers: string[]
  expectationsQuestion: string
  dimensions: {
    materiality: number
    transmissionConfidence: number
    capturePlausibility: number
    expectationsGap: number
    evidenceReadiness: number
    portfolioRelevance: number
    investability: number
  }
  decisiveNewEvent: boolean
}

export interface WorldUpdateProposal {
  asOf: string
  trigger: 'scheduled' | 'urgent' | 'manual' | 'backfill' | 'company_research'
  baseCommit: string | null
  orientation: string
  eventClassifications: Array<{
    eventClusterId: string
    classification: WorldChangeClassification
    rationale: string
  }>
  sources: WorldSourceReference[]
  upserts: WorldNode[]
  archives: Array<{ nodeId: string; reason: string; replacementId?: string }>
  opportunityLeads: WorldOpportunityLead[]
  journal: {
    title: string
    summary: string
    materialChanges: string[]
    beliefChanges: string[]
    scenarioChanges: string[]
    newInvestigations: string[]
    attentionIndicators: string[]
  }
}

export interface WorldUpdateDraft {
  orientation: string
  eventClassifications: Array<{
    eventKey: string
    classification: WorldChangeClassification
    rationale: string
  }>
  sources: WorldSourceReference[]
  upserts: WorldNode[]
  archives: Array<{ nodeId: string; reason: string; replacementId?: string }>
  opportunityLeads: WorldOpportunityLead[]
  journal: WorldUpdateProposal['journal']
}

export interface WorldCritique {
  verdict: 'pass' | 'revise' | 'reject'
  summary: string
  unsupportedClaimPaths: string[]
  duplicateNodeIds: string[]
  missingContradictions: string[]
  investmentBoundaryViolations: string[]
  revisionInstructions: string[]
}

export interface WorldThinkerRunSummary {
  id: string
  trigger: WorldUpdateProposal['trigger']
  status: 'queued' | 'orienting' | 'thinking' | 'criticizing' | 'revising' | 'committed' | 'rejected' | 'failed' | 'push_pending' | 'projected'
  checkpoint: string | null
  baseCommit: string | null
  resultCommit: string | null
  contextManifest: Record<string, unknown>
  criticVerdict: WorldCritique['verdict'] | null
  modelMetadata: Record<string, unknown>
  error: string | null
  startedAt: string
  finishedAt: string | null
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function string(value: unknown, label: string, max = 20_000): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) throw new Error(`${label} must be a non-empty string under ${max} characters`)
  return value.trim()
}

function strings(value: unknown, label: string, max = 50): string[] {
  if (!Array.isArray(value) || value.length > max || !value.every((item) => typeof item === 'string' && item.trim().length > 0)) {
    throw new Error(`${label} must contain at most ${max} non-empty strings`)
  }
  return value.map((item) => item.trim())
}

function score(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${label} must be between 0 and 100`)
  return Math.round(value)
}

function iso(value: unknown, label: string): string {
  const output = string(value, label, 64)
  if (!Number.isFinite(Date.parse(output))) throw new Error(`${label} must be an ISO timestamp`)
  return new Date(output).toISOString()
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, label: string): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) throw new Error(`${label} is invalid`)
  return value as T[number]
}

export function validateWorldSourceReference(value: unknown): WorldSourceReference {
  const input = record(value, 'source')
  const url = string(input.url, 'source.url', 2_048)
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('source.url must use http or https')
  return {
    id: string(input.id, 'source.id', 160),
    url,
    title: string(input.title, 'source.title', 500),
    publisher: typeof input.publisher === 'string' ? input.publisher.trim() : undefined,
    publishedAt: typeof input.publishedAt === 'string' ? iso(input.publishedAt, 'source.publishedAt') : undefined,
    claimState: enumValue(input.claimState, WORLD_CLAIM_STATES, 'source.claimState'),
    stance: enumValue(input.stance, ['supporting', 'contradicting', 'neutral'] as const, 'source.stance'),
  }
}

export function validateWorldNode(value: unknown): WorldNode {
  const input = record(value, 'node')
  const relationships = Array.isArray(input.relationships) ? input.relationships.map((entry, index) => {
    const item = record(entry, `relationships[${index}]`)
    return { type: string(item.type, 'relationship.type', 100), targetId: string(item.targetId, 'relationship.targetId', 160), description: string(item.description, 'relationship.description', 1_000) }
  }) : []
  const claims = Array.isArray(input.claims) ? input.claims.map((entry, index) => {
    const item = record(entry, `claims[${index}]`)
    return { text: string(item.text, 'claim.text', 2_000), sourceIds: strings(item.sourceIds, 'claim.sourceIds', 20), assessment: item.assessment === true || undefined }
  }) : []
  const indicators = Array.isArray(input.indicators) ? input.indicators.map((entry, index) => {
    const item = record(entry, `indicators[${index}]`)
    return {
      id: string(item.id, 'indicator.id', 160), label: string(item.label, 'indicator.label', 300), condition: string(item.condition, 'indicator.condition', 1_000),
      direction: enumValue(item.direction, ['higher', 'lower', 'crosses', 'changes'] as const, 'indicator.direction'),
      threshold: typeof item.threshold === 'string' ? item.threshold.trim() : undefined,
      sourceIds: strings(item.sourceIds, 'indicator.sourceIds', 20),
    }
  }) : []
  const kind = enumValue(input.kind, WORLD_NODE_KINDS, 'node.kind')
  const probability = input.probabilityRange === undefined || input.probabilityRange === null ? undefined : record(input.probabilityRange, 'node.probabilityRange')
  const probabilityRange = probability ? { low: score(probability.low, 'probabilityRange.low'), high: score(probability.high, 'probabilityRange.high'), label: enumValue(probability.label, ['assessment'] as const, 'probabilityRange.label') } : undefined
  if (probabilityRange && probabilityRange.low > probabilityRange.high) throw new Error('Scenario probability range low must not exceed high')
  const specialized = kind === 'hypothesis' ? {
    mechanism: string(input.mechanism, 'hypothesis.mechanism', 3_000), economicVariable: string(input.economicVariable, 'hypothesis.economicVariable', 1_000),
    constrainedLayer: string(input.constrainedLayer, 'hypothesis.constrainedLayer', 1_000), rentRecipient: string(input.rentRecipient, 'hypothesis.rentRecipient', 1_000),
    expectationsQuestion: string(input.expectationsQuestion, 'hypothesis.expectationsQuestion', 2_000), catalysts: strings(input.catalysts, 'hypothesis.catalysts', 20), falsifiers: strings(input.falsifiers, 'hypothesis.falsifiers', 20),
  } : {}
  const result: WorldNode = {
    id: string(input.id, 'node.id', 160),
    kind,
    title: string(input.title, 'node.title', 300),
    status: enumValue(input.status, ['active', 'monitoring', 'dormant', 'superseded', 'archived'] as const, 'node.status'),
    asOf: iso(input.asOf, 'node.asOf'),
    confidence: score(input.confidence, 'node.confidence'),
    importance: score(input.importance, 'node.importance'),
    aliases: strings(input.aliases ?? [], 'node.aliases', 30),
    relationships,
    sourceIds: strings(input.sourceIds, 'node.sourceIds', 100),
    nextReviewAt: iso(input.nextReviewAt, 'node.nextReviewAt'),
    summary: string(input.summary, 'node.summary', 2_000),
    claims,
    indicators,
    body: string(input.body, 'node.body', 16_000),
    supersedes: typeof input.supersedes === 'string' ? input.supersedes.trim() : undefined,
    changeSummary: typeof input.changeSummary === 'string' ? string(input.changeSummary, 'node.changeSummary', 2_000) : undefined,
    probabilityRange,
    signposts: input.signposts === undefined ? undefined : strings(input.signposts, 'node.signposts', 20),
    ...specialized,
  }
  if (result.supersedes && !result.changeSummary) throw new Error(`Replacement node ${result.id} must record changeSummary`)
  if (kind === 'scenario' && (!result.signposts || result.signposts.length === 0)) throw new Error(`Scenario ${result.id} requires signposts`)
  return result
}

export function validateWorldOpportunityLead(value: unknown): WorldOpportunityLead {
  const input = record(value, 'opportunity lead')
  const dimensions = record(input.dimensions, 'opportunity lead dimensions')
  const symbol = string(input.symbol, 'lead.symbol', 12).toUpperCase()
  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) throw new Error('lead.symbol is invalid')
  return {
    id: string(input.id, 'lead.id', 160), originatingNodeId: string(input.originatingNodeId, 'lead.originatingNodeId', 160),
    originatingHypothesisId: string(input.originatingHypothesisId, 'lead.originatingHypothesisId', 160), symbol,
    issuer: string(input.issuer, 'lead.issuer', 300), valueChainRole: string(input.valueChainRole, 'lead.valueChainRole', 1_000),
    whatChanged: string(input.whatChanged, 'lead.whatChanged', 2_000), whyNow: string(input.whyNow, 'lead.whyNow', 2_000),
    transmissionMechanism: string(input.transmissionMechanism, 'lead.transmissionMechanism', 3_000), captureMechanism: string(input.captureMechanism, 'lead.captureMechanism', 3_000),
    captureConditions: strings(input.captureConditions, 'lead.captureConditions', 12), supportingSourceIds: strings(input.supportingSourceIds, 'lead.supportingSourceIds', 30),
    contradictingSourceIds: strings(input.contradictingSourceIds, 'lead.contradictingSourceIds', 30), evidenceGaps: strings(input.evidenceGaps, 'lead.evidenceGaps', 20),
    decisiveQuestions: strings(input.decisiveQuestions, 'lead.decisiveQuestions', 20), catalysts: strings(input.catalysts, 'lead.catalysts', 20), falsifiers: strings(input.falsifiers, 'lead.falsifiers', 20),
    expectationsQuestion: string(input.expectationsQuestion, 'lead.expectationsQuestion', 2_000),
    dimensions: {
      materiality: score(dimensions.materiality, 'dimensions.materiality'), transmissionConfidence: score(dimensions.transmissionConfidence, 'dimensions.transmissionConfidence'),
      capturePlausibility: score(dimensions.capturePlausibility, 'dimensions.capturePlausibility'), expectationsGap: score(dimensions.expectationsGap, 'dimensions.expectationsGap'),
      evidenceReadiness: score(dimensions.evidenceReadiness, 'dimensions.evidenceReadiness'), portfolioRelevance: score(dimensions.portfolioRelevance, 'dimensions.portfolioRelevance'),
      investability: score(dimensions.investability, 'dimensions.investability'),
    },
    decisiveNewEvent: input.decisiveNewEvent === true,
  }
}

export function validateWorldUpdateProposal(value: unknown): WorldUpdateProposal {
  const input = record(value, 'world update proposal')
  const sources = Array.isArray(input.sources) ? input.sources.map(validateWorldSourceReference) : []
  const upserts = Array.isArray(input.upserts) ? input.upserts.map(validateWorldNode) : []
  const classifications = Array.isArray(input.eventClassifications) ? input.eventClassifications.map((entry, index) => {
    const item = record(entry, `eventClassifications[${index}]`)
    return { eventClusterId: string(item.eventClusterId, 'classification.eventClusterId', 160), classification: enumValue(item.classification, ['confirmation', 'contradiction', 'novelty', 'noise', 'uncertainty'] as const, 'classification.classification'), rationale: string(item.rationale, 'classification.rationale', 2_000) }
  }) : []
  const archives = Array.isArray(input.archives) ? input.archives.map((entry, index) => {
    const item = record(entry, `archives[${index}]`)
    return { nodeId: string(item.nodeId, 'archive.nodeId', 160), reason: string(item.reason, 'archive.reason', 2_000), replacementId: typeof item.replacementId === 'string' ? item.replacementId.trim() : undefined }
  }) : []
  const journalInput = record(input.journal, 'journal')
  const proposal: WorldUpdateProposal = {
    asOf: iso(input.asOf, 'proposal.asOf'), trigger: enumValue(input.trigger, ['scheduled', 'urgent', 'manual', 'backfill', 'company_research'] as const, 'proposal.trigger'),
    baseCommit: input.baseCommit === null ? null : string(input.baseCommit, 'proposal.baseCommit', 64), orientation: string(input.orientation, 'proposal.orientation', 4_000),
    eventClassifications: classifications, sources, upserts, archives,
    opportunityLeads: Array.isArray(input.opportunityLeads) ? input.opportunityLeads.map(validateWorldOpportunityLead) : [],
    journal: {
      title: string(journalInput.title, 'journal.title', 300), summary: string(journalInput.summary, 'journal.summary', 3_000),
      materialChanges: strings(journalInput.materialChanges, 'journal.materialChanges', 20), beliefChanges: strings(journalInput.beliefChanges, 'journal.beliefChanges', 20),
      scenarioChanges: strings(journalInput.scenarioChanges, 'journal.scenarioChanges', 20), newInvestigations: strings(journalInput.newInvestigations, 'journal.newInvestigations', 20),
      attentionIndicators: strings(journalInput.attentionIndicators, 'journal.attentionIndicators', 20),
    },
  }
  if (proposal.upserts.length > 40 || proposal.opportunityLeads.length > 12) throw new Error('World update exceeds bounded output limits')
  if (proposal.upserts.filter((node) => node.kind === 'current').length !== 1) throw new Error('World update must contain exactly one current-state node')
  if (proposal.upserts.some((node) => node.kind === 'journal')) throw new Error('World journals are rendered by the host and cannot be model upserts')
  return proposal
}

export function validateWorldUpdateDraft(value: unknown): WorldUpdateDraft {
  const input = record(value, 'world update draft')
  const classifications = Array.isArray(input.eventClassifications) ? input.eventClassifications.map((entry, index) => {
    const item = record(entry, `eventClassifications[${index}]`)
    return { eventKey: string(item.eventKey, 'classification.eventKey', 16), classification: enumValue(item.classification, ['confirmation', 'contradiction', 'novelty', 'noise', 'uncertainty'] as const, 'classification.classification'), rationale: string(item.rationale, 'classification.rationale', 2_000) }
  }) : []
  const canonical = validateWorldUpdateProposal({ ...input, asOf: new Date().toISOString(), trigger: 'scheduled', baseCommit: null, eventClassifications: classifications.map((item) => ({ eventClusterId: item.eventKey, classification: item.classification, rationale: item.rationale })) })
  return {
    orientation: canonical.orientation,
    eventClassifications: classifications,
    sources: canonical.sources,
    upserts: canonical.upserts,
    archives: canonical.archives,
    opportunityLeads: canonical.opportunityLeads,
    journal: canonical.journal,
  }
}

export function validateWorldCritique(value: unknown): WorldCritique {
  const input = record(value, 'world critique')
  return {
    verdict: enumValue(input.verdict, ['pass', 'revise', 'reject'] as const, 'critique.verdict'), summary: string(input.summary, 'critique.summary', 3_000),
    unsupportedClaimPaths: strings(input.unsupportedClaimPaths, 'critique.unsupportedClaimPaths', 50), duplicateNodeIds: strings(input.duplicateNodeIds, 'critique.duplicateNodeIds', 50),
    missingContradictions: strings(input.missingContradictions, 'critique.missingContradictions', 50), investmentBoundaryViolations: strings(input.investmentBoundaryViolations, 'critique.investmentBoundaryViolations', 50),
    revisionInstructions: strings(input.revisionInstructions, 'critique.revisionInstructions', 50),
  }
}
