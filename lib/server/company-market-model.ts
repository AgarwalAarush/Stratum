import type {
  CompanyMarketBusinessLine,
  CompanyMarketCausalLink,
  CompanyMarketCompetitor,
  CompanyMarketConstraint,
  CompanyMarketCrossCheck,
  CompanyMarketEvidenceStatus,
  CompanyMarketFalsifier,
  CompanyMarketForce,
  CompanyMarketModel,
  CompanyMarketPrediction,
  CompanyMarketStrategicRelationship,
  CompanyMarketValueChainLayer,
  CompanyPacket,
} from '../markets/types.ts'
import { runCodexJson } from './codex-exec.ts'
import { getSupabaseClient } from './supabase.ts'

type CompanyMarketModelGeneration = Omit<CompanyMarketModel,
  'id' | 'symbol' | 'version' | 'status' | 'provider' | 'model' | 'dataAsOf' | 'generatedAt' | 'error'>

const EVIDENCE_STATUSES = new Set<CompanyMarketEvidenceStatus>([
  'observed',
  'company_claim',
  'analyst_inference',
  'unverified',
])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(record) : []
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${label}`)
  return value.trim()
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    : []
}

function boundedRecords(value: unknown, label: string, min: number, max: number): Array<Record<string, unknown>> {
  const items = records(value)
  if (items.length < min || items.length > max) throw new Error(`${label} must contain ${min}-${max} items`)
  return items
}

function evidenceStatus(value: unknown, label: string): CompanyMarketEvidenceStatus {
  if (!EVIDENCE_STATUSES.has(value as CompanyMarketEvidenceStatus)) throw new Error(`Invalid ${label} evidence status`)
  return value as CompanyMarketEvidenceStatus
}

function sourceIds(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} sourceIds must be an array`)
  return strings(value)
}

function assertKnownSources(model: CompanyMarketModelGeneration, allowedSourceIds?: ReadonlySet<string>): void {
  const unknown = new Set<string>()
  const nested = new Set<string>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'sourceIds') {
        for (const id of strings(item)) {
          nested.add(id)
          if (allowedSourceIds && !allowedSourceIds.has(id)) unknown.add(id)
        }
      } else {
        visit(item)
      }
    }
  }
  const { sourceIds: declaredSourceIds, ...modelWithoutLedger } = model
  visit(modelWithoutLedger)
  for (const id of declaredSourceIds) if (allowedSourceIds && !allowedSourceIds.has(id)) unknown.add(id)
  if (unknown.size > 0) throw new Error(`Company market model referenced unknown source IDs: ${[...unknown].join(', ')}`)
  const declared = new Set(declaredSourceIds)
  const missing = [...nested].filter((id) => !declared.has(id))
  if (missing.length > 0) throw new Error(`Company market model source ledger omitted referenced source IDs: ${missing.join(', ')}`)
}

export function validateCompanyMarketModel(
  value: unknown,
  allowedSourceIds?: ReadonlySet<string>,
): CompanyMarketModelGeneration {
  const output = record(value)
  const businessLines: CompanyMarketBusinessLine[] = boundedRecords(output.businessLines, 'businessLines', 1, 8).map((item) => {
    const maturity = item.maturity as CompanyMarketBusinessLine['maturity']
    if (!['proven', 'scaling', 'emerging', 'optionality'].includes(maturity)) throw new Error('Invalid business-line maturity')
    return {
      name: requiredString(item.name, 'business line name'),
      offering: requiredString(item.offering, 'business line offering'),
      customers: requiredString(item.customers, 'business line customers'),
      jobToBeDone: requiredString(item.jobToBeDone, 'business line jobToBeDone'),
      monetization: requiredString(item.monetization, 'business line monetization'),
      maturity,
      evidenceStatus: evidenceStatus(item.evidenceStatus, 'business line'),
      sourceIds: sourceIds(item.sourceIds, 'business line'),
    }
  })
  const valueChain: CompanyMarketValueChainLayer[] = boundedRecords(output.valueChain, 'valueChain', 2, 10).map((item) => ({
    layer: requiredString(item.layer, 'value-chain layer'),
    role: requiredString(item.role, 'value-chain role'),
    companyPosition: requiredString(item.companyPosition, 'company value-chain position'),
    economics: requiredString(item.economics, 'value-chain economics'),
    participants: strings(item.participants),
    sourceIds: sourceIds(item.sourceIds, 'value-chain layer'),
  }))
  const demandDrivers: CompanyMarketForce[] = boundedRecords(output.demandDrivers, 'demandDrivers', 2, 8).map((item) => {
    const direction = item.direction as CompanyMarketForce['direction']
    if (!['tailwind', 'headwind', 'mixed'].includes(direction)) throw new Error('Invalid demand-driver direction')
    return {
      name: requiredString(item.name, 'demand-driver name'),
      direction,
      mechanism: requiredString(item.mechanism, 'demand-driver mechanism'),
      horizon: requiredString(item.horizon, 'demand-driver horizon'),
      evidenceStatus: evidenceStatus(item.evidenceStatus, 'demand driver'),
      sourceIds: sourceIds(item.sourceIds, 'demand driver'),
    }
  })
  const supplyConstraints: CompanyMarketConstraint[] = boundedRecords(output.supplyConstraints, 'supplyConstraints', 1, 8).map((item) => {
    const severity = item.severity as CompanyMarketConstraint['severity']
    if (!['binding', 'important', 'watch', 'not_established'].includes(severity)) throw new Error('Invalid constraint severity')
    const resolutionSignals = strings(item.resolutionSignals)
    if (resolutionSignals.length < 1 || resolutionSignals.length > 6) throw new Error('Constraint requires 1-6 resolution signals')
    return {
      name: requiredString(item.name, 'constraint name'),
      severity,
      mechanism: requiredString(item.mechanism, 'constraint mechanism'),
      scarcityRentCapture: requiredString(item.scarcityRentCapture, 'scarcity-rent capture'),
      resolutionSignals,
      sourceIds: sourceIds(item.sourceIds, 'constraint'),
    }
  })
  const causalChain: CompanyMarketCausalLink[] = boundedRecords(output.causalChain, 'causalChain', 2, 12).map((item) => ({
    from: requiredString(item.from, 'causal-link origin'),
    to: requiredString(item.to, 'causal-link outcome'),
    mechanism: requiredString(item.mechanism, 'causal-link mechanism'),
    evidenceStatus: evidenceStatus(item.evidenceStatus, 'causal link'),
    sourceIds: sourceIds(item.sourceIds, 'causal link'),
  }))
  const marketStructureRecord = record(output.marketStructure)
  const competitors: CompanyMarketCompetitor[] = boundedRecords(output.competitors, 'competitors', 1, 8).map((item) => ({
    name: requiredString(item.name, 'competitor name'),
    customerOverlap: requiredString(item.customerOverlap, 'competitor customer overlap'),
    capability: requiredString(item.capability, 'competitor capability'),
    companyAdvantage: requiredString(item.companyAdvantage, 'company advantage'),
    companyGap: requiredString(item.companyGap, 'company gap'),
    implication: requiredString(item.implication, 'competitive implication'),
    sourceIds: sourceIds(item.sourceIds, 'competitor'),
  }))
  const strategicRelationships: CompanyMarketStrategicRelationship[] = boundedRecords(output.strategicRelationships, 'strategicRelationships', 0, 8).map((item) => {
    const status = item.status as CompanyMarketStrategicRelationship['status']
    if (!['verified', 'company_claim', 'analyst_inference', 'unverified'].includes(status)) throw new Error('Invalid strategic-relationship status')
    return {
      entity: requiredString(item.entity, 'strategic relationship entity'),
      relationship: requiredString(item.relationship, 'strategic relationship'),
      status,
      economicMechanism: requiredString(item.economicMechanism, 'strategic relationship economic mechanism'),
      thesisTreatment: requiredString(item.thesisTreatment, 'strategic relationship thesis treatment'),
      sourceIds: sourceIds(item.sourceIds, 'strategic relationship'),
    }
  })
  const crossChecks: CompanyMarketCrossCheck[] = boundedRecords(output.crossChecks, 'crossChecks', 1, 4).map((item) => ({
    method: requiredString(item.method, 'cross-check method'),
    result: requiredString(item.result, 'cross-check result'),
    implication: requiredString(item.implication, 'cross-check implication'),
    sourceIds: sourceIds(item.sourceIds, 'cross-check'),
  }))
  const expectationsRecord = record(output.expectations)
  const predictions: CompanyMarketPrediction[] = boundedRecords(output.predictions, 'predictions', 3, 8).map((item) => ({
    prediction: requiredString(item.prediction, 'prediction'),
    horizon: requiredString(item.horizon, 'prediction horizon'),
    leadingIndicator: requiredString(item.leadingIndicator, 'prediction leading indicator'),
    confirmation: requiredString(item.confirmation, 'prediction confirmation'),
    disconfirmation: requiredString(item.disconfirmation, 'prediction disconfirmation'),
    sourceIds: sourceIds(item.sourceIds, 'prediction'),
  }))
  const falsifiers: CompanyMarketFalsifier[] = boundedRecords(output.falsifiers, 'falsifiers', 3, 8).map((item) => ({
    condition: requiredString(item.condition, 'falsifier condition'),
    observable: requiredString(item.observable, 'falsifier observable'),
    thesisImpact: requiredString(item.thesisImpact, 'falsifier thesis impact'),
    sourceIds: sourceIds(item.sourceIds, 'falsifier'),
  }))
  const financialRoleRecord = record(output.financialRole)
  const confidence = Number(output.confidence)
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) throw new Error('Invalid company market model confidence')
  const evidenceGaps = strings(output.evidenceGaps)
  if (evidenceGaps.length < 1 || evidenceGaps.length > 12) throw new Error('Company market model requires 1-12 evidence gaps')
  const model: CompanyMarketModelGeneration = {
    businessSummary: requiredString(output.businessSummary, 'businessSummary'),
    centralMarketQuestion: requiredString(output.centralMarketQuestion, 'centralMarketQuestion'),
    marketThesis: requiredString(output.marketThesis, 'marketThesis'),
    businessLines,
    valueChain,
    demandDrivers,
    supplyConstraints,
    causalChain,
    marketStructure: {
      marketDefinition: requiredString(marketStructureRecord.marketDefinition, 'market definition'),
      pricingPower: requiredString(marketStructureRecord.pricingPower, 'pricing power'),
      scarcityRentCapture: requiredString(marketStructureRecord.scarcityRentCapture, 'market scarcity-rent capture'),
      cyclicality: requiredString(marketStructureRecord.cyclicality, 'market cyclicality'),
      regulationAndPolicy: requiredString(marketStructureRecord.regulationAndPolicy, 'regulation and policy'),
    },
    competitors,
    strategicRelationships,
    crossChecks,
    expectations: {
      currentNarrative: requiredString(expectationsRecord.currentNarrative, 'current narrative'),
      whatAppearsPriced: requiredString(expectationsRecord.whatAppearsPriced, 'what appears priced'),
      variantView: requiredString(expectationsRecord.variantView, 'variant view'),
      sourceIds: sourceIds(expectationsRecord.sourceIds, 'expectations'),
    },
    predictions,
    falsifiers,
    financialRole: {
      fundingCapacity: requiredString(financialRoleRecord.fundingCapacity, 'funding capacity'),
      monetizationProof: requiredString(financialRoleRecord.monetizationProof, 'monetization proof'),
      valuationConstraint: requiredString(financialRoleRecord.valuationConstraint, 'valuation constraint'),
      sourceIds: sourceIds(financialRoleRecord.sourceIds, 'financial role'),
    },
    evidenceGaps,
    confidence,
    sourceIds: sourceIds(output.sourceIds, 'company market model'),
  }
  assertKnownSources(model, allowedSourceIds)
  return model
}

function companyMarketModelPrompt(
  packet: CompanyPacket,
  priorModel: CompanyMarketModel | null,
  reason: string,
): string {
  return [
    'Act as a senior market structure and company strategy analyst. Build a causal CompanyMarketModel before any equity rating or valuation conclusion is written.',
    'Use only facts and source IDs contained in the CompanyPacket. Never invent a market size, customer metric, relationship, competitor fact, policy event, prediction input, or citation.',
    'This is an analytical model, not an equity research report. Do not return BUY/HOLD/SELL, an entry action, a fair value, or portfolio sizing.',
    'Begin with what the company actually sells, who buys it, the job each product performs, and how each business line monetizes. Separate proven businesses, scaling businesses, emerging adjacencies, and long-duration optionality.',
    'Map the value chain around the company. Identify upstream dependencies, the company layer, downstream customers, substitutes, and which layer captures the economics. Do not equate a large end-market TAM with shareholder value.',
    'Build the central causal chain explicitly: external demand or environmental change -> constraint or enabling capability -> customer behavior -> company volume/pricing/mix -> monetization -> shareholder-relevant outcome. Each link must say how the effect transmits and whether it is observed, a company claim, an analyst inference, or unverified.',
    'Identify the binding constraint if the evidence supports one. If it does not, use severity not_established and explain what evidence would establish it. State who captures any scarcity rent and why.',
    'Cover the economic, policy, regulatory, supply-chain, geopolitical, technology, and customer environment only where it materially changes demand, supply, competitive advantage, or timing.',
    'Use at least one independent cross-check of the central thesis. A cross-check may use a different source, a different calculation route, observed market behavior, capacity/backlog evidence, customer adoption, or competitor behavior. If no independent cross-check is possible, state that result and make the missing evidence explicit.',
    'Treat strategic relationships carefully. Distinguish a verified corporate or commercial relationship from a company claim, analyst inference, or unverified narrative. Explain the direct economic mechanism required before a relationship changes the thesis.',
    'Expectations must distinguish the current narrative, what the supplied price/consensus/positioning evidence appears to price, and the variant view. Do not pretend market expectations are known when the packet cannot support them.',
    'Predictions must be falsifiable and observable over a stated horizon. Give the leading indicator, what confirms the prediction, and what disproves it. Falsifiers must change the market thesis, not merely describe stock-price volatility.',
    'Financial evidence is one layer: use it to test funding capacity, monetization proof, and valuation constraints. It must not replace the product, market, value-chain, or competitive model.',
    'Keep sourceIds empty for unsupported analyst inference; never attach a source that does not directly support the field. Include every directly used source ID in the top-level sourceIds array.',
    priorModel
      ? `This is a refresh triggered by "${reason}". Use prior model version ${priorModel.version} as a baseline, retain still-supported mechanisms, and replace conclusions when the new packet changes the evidence.`
      : `This is the initial market model, triggered by "${reason}".`,
    priorModel ? `PRIOR COMPANY MARKET MODEL:\n${JSON.stringify(priorModel)}` : 'PRIOR COMPANY MARKET MODEL: none',
    `COMPANY PACKET:\n${JSON.stringify(packet)}`,
  ].join('\n\n')
}

function normalizeCompanyMarketModel(row: Record<string, unknown>): CompanyMarketModel {
  const content = record(row.content)
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    version: Number(row.version),
    status: row.status as CompanyMarketModel['status'],
    ...validateCompanyMarketModel(content),
    provider: String(row.provider ?? ''),
    model: String(row.model ?? ''),
    dataAsOf: String(row.data_as_of),
    generatedAt: String(row.generated_at),
    error: row.error === null ? null : String(row.error ?? ''),
  }
}

async function nextMarketModelVersion(ownerId: string, symbol: string): Promise<number> {
  const supabase = getSupabaseClient()
  if (!supabase) return 1
  const { data } = await supabase.from('company_market_models').select('version')
    .eq('owner_id', ownerId)
    .eq('symbol', symbol)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  return Number(data?.version ?? 0) + 1
}

export async function fetchLatestCompanyMarketModel(ownerId: string, symbol: string): Promise<CompanyMarketModel | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data } = await supabase.from('company_market_models').select('*')
    .eq('owner_id', ownerId)
    .eq('symbol', symbol)
    .eq('status', 'complete')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? normalizeCompanyMarketModel(data) : null
}

export async function materializeCompanyMarketModel(
  packet: CompanyPacket,
  ownerId: string,
  reason = 'manual',
): Promise<CompanyMarketModel> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase service credentials are not configured')
  const priorModel = await fetchLatestCompanyMarketModel(ownerId, packet.symbol)
  const version = await nextMarketModelVersion(ownerId, packet.symbol)
  const { data: row, error: createError } = await supabase.from('company_market_models').insert({
    symbol: packet.symbol,
    owner_id: ownerId,
    company_packet_id: packet.id,
    version,
    status: 'running',
    data_as_of: packet.dataAsOf,
  }).select('id').single()
  if (createError || !row) throw new Error(`Unable to create company market model: ${createError?.message ?? 'unknown error'}`)
  try {
    const allowedSourceIds = new Set(packet.sources.map((source) => source.id))
    const result = await runCodexJson({
      prompt: companyMarketModelPrompt(packet, priorModel, reason),
      schemaPath: 'schemas/company-market-model.schema.json',
      validate: (value) => validateCompanyMarketModel(value, allowedSourceIds),
      timeoutMs: 20 * 60 * 1_000,
    })
    const generatedAt = new Date().toISOString()
    const { error } = await supabase.from('company_market_models').update({
      status: 'complete',
      content: result.data,
      source_ids: result.data.sourceIds,
      provider: result.metadata.provider,
      model: result.metadata.model,
      generated_at: generatedAt,
      error: null,
    }).eq('id', row.id).eq('status', 'running')
    if (error) throw new Error(`Unable to publish company market model: ${error.message}`)
    return {
      id: row.id,
      symbol: packet.symbol,
      version,
      status: 'complete',
      ...result.data,
      provider: result.metadata.provider,
      model: result.metadata.model,
      dataAsOf: packet.dataAsOf,
      generatedAt,
      error: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase.from('company_market_models').update({ status: 'failed', error: message }).eq('id', row.id)
    throw error
  }
}
