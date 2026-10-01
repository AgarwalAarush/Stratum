import { createHash } from 'node:crypto'
export type RefreshKind = 'unchanged' | 'reprice' | 'revalidate' | 'full_research'
export type RefreshDecision = {kind: RefreshKind; reasons: string[]; sourceReferences: string[]; evidenceHash: string}
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const administrative = new Set(['id','version','generatedAt','dataAsOf','retrievedAt','availableAt','checkedAt','fetchedAt','observedAt','capturedAt','sourceIds','sourceDates','provider','model','worldOrigin','marketTheses','existingThesis'])
const marks = new Set(['price','latestPrice','currentPrice','marketCap','mktCap','changes','change','lastDiv','volAvg','range','beta','forwardPe','pe','priceEarningsRatio','priceToSalesRatio','priceToBookRatio'])
export function semanticValue(value: unknown, omitMarks = false): unknown {
  if (Array.isArray(value)) return value.map(v => semanticValue(v, omitMarks)).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([k])=>!administrative.has(k) && (!omitMarks || !marks.has(k))).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,semanticValue(v,omitMarks)]))
}
export function semanticHash(value: unknown): string { return createHash('sha256').update(JSON.stringify(semanticValue(value) ?? null)).digest('hex') }
function substantivePacket(packet: Record<string, unknown>, instrument: 'equity' | 'etf') {
  if (instrument === 'etf') return {symbol:packet.symbol, issuer:packet.issuer, fundName:packet.fundName, benchmark:packet.benchmark, strategy:packet.strategy, expenseRatio:packet.expenseRatio, rebalanceFrequency:packet.rebalanceFrequency,
    holdings: Array.isArray(packet.holdings) ? packet.holdings.map(h=>{ const r=object(h); return {symbol:r.symbol,identifier:r.identifier,name:r.name,classification:r.classification,shares:r.shares} }) : [], holdingsCount:packet.holdingsCount}
  return { ...Object.fromEntries(['symbol','company','financialStatements','financialReconciliation','segmentRevenue','transcripts','estimates'].map(key=>[key,semanticValue(packet[key],true)])),
    periodicFilings: Array.isArray(packet.filings) ? packet.filings.filter(f=>/10-[KQ]/i.test(String(object(f).form ?? object(f).title))) : [],
    decisiveEvents: Array.isArray(packet.events) ? packet.events.filter(e=>/earnings|results|guidance|acquir|merg|divest|spin-off|bankrupt|restatement|capital raise|secondary offering|share (?:buyback|issuance)|stock split/i.test(String(object(e).title))) : [] }
}
export function classifyResearchRefresh(input: {priorPacket: unknown; packet: unknown; instrument: 'equity' | 'etf'; onDemand?: boolean; priorGeneratedAt?: string; now?: Date; conditionsChanged?: boolean; forecastChanged?: boolean}): RefreshDecision {
  const current=object(input.packet), prior=object(input.priorPacket)
  const sources = Array.isArray(current.sources) ? current.sources.map(s=>String(object(s).url ?? '')).filter(Boolean) : []
  const substantive = substantivePacket(current,input.instrument)
  const evidenceHash=semanticHash(substantive)
  const decision = (kind: RefreshKind, ...reasons: string[]): RefreshDecision => ({kind,reasons,sourceReferences:sources,evidenceHash})
  if (!Object.keys(prior).length) return decision('full_research','Initial evidence coverage')
  if (input.onDemand) return decision('full_research','Owner requested a full report')
  if (input.forecastChanged) return decision('revalidate','Resolved outcome needs a targeted check of its decisive premise')
  const before=substantivePacket(prior,input.instrument)
  const changed=Object.keys(substantive).filter(k=>semanticHash(object(before)[k] ?? null)!==semanticHash(object(substantive)[k] ?? null))
  if (changed.length) return decision('full_research',`Substantive evidence changed: ${changed.join(', ')}`)
  if (['researchEvidence','events','filings','outcomeFeedback'].some(key=>semanticHash(current[key] ?? null)!==semanticHash(prior[key] ?? null))) return decision('revalidate','New contextual evidence needs a targeted materiality check')
  const quality=object(current.evidenceQuality), previousQuality=object(prior.evidenceQuality)
  if (semanticHash(quality.missing ?? []) !== semanticHash(previousQuality.missing ?? []) || input.conditionsChanged) return decision('revalidate','Evidence gaps or a decision condition changed')
  if (input.priorGeneratedAt && (input.now ?? new Date()).getTime()-Date.parse(input.priorGeneratedAt)>35*86400000) return decision('revalidate','Check current evidence against the age limit; age alone does not require a report')
  if (semanticHash(current.priceHistory) !== semanticHash(prior.priceHistory) || (input.instrument === 'etf' && semanticHash(current.holdings)!==semanticHash(prior.holdings))) return decision('reprice','Market marks changed while substantive evidence remained equivalent')
  if (semanticHash(current) !== semanticHash(prior)) return decision('revalidate','Ambiguous non-substantive change requires a targeted check')
  return decision('unchanged','Substantive evidence and decision conditions are equivalent')
}
