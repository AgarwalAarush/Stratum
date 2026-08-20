import { createHash } from 'node:crypto'

export const CLINICAL_CATALYST_KINDS = [
  'trial_result',
  'regulatory_decision',
  'clinical_hold',
  'safety_signal',
  'trial_start',
  'medical_meeting',
] as const

export type ClinicalCatalystKind = typeof CLINICAL_CATALYST_KINDS[number]
export type ClinicalCatalystOutcome = 'positive' | 'negative' | 'mixed' | 'pending' | 'unknown'
export type ClinicalCatalystSignificance = 'urgent' | 'investigate' | 'monitor'

export interface ClinicalCatalystSource {
  id: string
  feedItemId?: string
  documentId?: string
  title: string
  url: string
  publisher: string
  publishedAt: string | null
  fetchedAt: string
  metadata?: Record<string, unknown>
}

export interface ClinicalCatalyst {
  fingerprint: string
  title: string
  url: string
  publisher: string
  sourceId: string
  feedItemId: string | null
  documentId: string | null
  publishedAt: string | null
  fetchedAt: string
  kind: ClinicalCatalystKind
  outcome: ClinicalCatalystOutcome
  significance: ClinicalCatalystSignificance
  phase: string | null
  trialId: string | null
  therapy: string | null
  indication: string | null
  symbols: string[]
  materiality: number
  timeSensitivity: number
  economicChannels: string[]
  decisiveNewEvent: boolean
  summary: string
}

const CLINICAL_CONTEXT = /\b(?:phase\s*(?:1|2|3|i{1,3}|iv)|clinical trial|pivotal trial|late-stage trial|primary endpoint|secondary endpoint|overall survival|progression-free survival|recurrence-free survival|distant metastasis-free survival|clinical hold|safety signal|advisory committee|pdufa|complete response letter|breakthrough therapy|accelerated approval|fda approves?|fda rejects?|vaccine|oncology|biotech|biopharma)\b/i
const MATERIAL_OUTCOME = /\b(?:met|missed|failed|succeeded|positive|negative|stopped|halted|paused|approved|rejected|accepted|cleared|superiority|noninferiority|survival|recurrence|metastasis|adverse event|toxicity|death)\b/i
const TRIAL_START = /\b(?:(?:initiates?|begins?|starts?)\s+(?:a\s+|the\s+|first\s+)?(?:phase|clinical|human|pivotal|trial|study)|enrolls?\s+(?:a\s+|the\s+|first\s+)?(?:patient|subject|participant)|doses? first patient|fully enrolled)\b/i
const MEDICAL_MEETING = /\b(?:asco|aacr|esmo|ash|aha|acc|ada|scientific meeting|medical meeting|late-breaking abstract|oral presentation)\b/i
const POSITIVE = /\b(?:met (?:its |the )?(?:primary|key secondary|co-primary)?\s*endpoints?|positive\b.{0,50}\b(?:phase|trial|data|results?)|succeeded|statistically significant|superior|approved|cleared|accepted for (?:filing|review)|breakthrough therapy)\b/i
const NEGATIVE = /\b(?:missed|failed|did not meet|clinical hold|complete response letter|rejected|stopped for futility|halted|serious safety|excess deaths?|toxicity)\b/i
const MIXED = /\b(?:mixed results?|met .* but (?:missed|failed)|primary endpoint .* secondary endpoint)\b/i

const INDICATIONS = [
  'melanoma', 'non-small cell lung cancer', 'small cell lung cancer', 'lung cancer', 'breast cancer', 'prostate cancer',
  'colorectal cancer', 'pancreatic cancer', 'bladder cancer', 'renal cell carcinoma', 'kidney cancer', 'ovarian cancer',
  'multiple myeloma', 'leukemia', 'lymphoma', 'solid tumors', 'alzheimer', 'parkinson', 'obesity', 'diabetes',
  'crohn', 'ulcerative colitis', 'influenza', 'covid-19', 'rsv', 'cmv', 'hiv', 'rare disease',
] as const

const THERAPY_PATTERNS = [
  /\b(?:intismeran autogene|intismeran|mRNA-4157|V940)\b/i,
  /\b[A-Z]{2,5}-\d{3,6}[A-Z]?\b/,
  /\b[a-z][a-z0-9-]{4,}(?:mab|nib|cept|gene|vax)\b/i,
] as const

function normalized(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function sourceSymbol(metadata: Record<string, unknown> | undefined): string[] {
  const topic = typeof metadata?.topic === 'string' ? metadata.topic : ''
  const category = typeof metadata?.category === 'string' ? metadata.category : ''
  const values = [topic.match(/^company:([A-Z][A-Z0-9.-]{0,11})$/)?.[1], category.match(/[·|]\s*([A-Z][A-Z0-9.-]{0,11})\s*$/)?.[1]]
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function clinicalPhase(title: string): string | null {
  const match = title.match(/\bphase\s*(1|2|3|i{1,3}|iv)(?:\s*\/\s*(1|2|3|i{1,3}|iv))?\b/i)
  if (!match) return null
  const number = (value: string) => ({ i: '1', ii: '2', iii: '3', iv: '4' })[value.toLowerCase()] ?? value
  return match[2] ? `Phase ${number(match[1])}/${number(match[2])}` : `Phase ${number(match[1])}`
}

function catalystKind(title: string): ClinicalCatalystKind | null {
  if (/\bclinical hold\b|\bpartial clinical hold\b/i.test(title)) return 'clinical_hold'
  if (/\b(?:safety signal|serious adverse|excess deaths?|toxicity|patient death)\b/i.test(title)) return 'safety_signal'
  if (/\b(?:fda|ema|european commission|mhra|pdufa|complete response letter|breakthrough therapy|accelerated approval)\b/i.test(title) && MATERIAL_OUTCOME.test(title)) return 'regulatory_decision'
  if (CLINICAL_CONTEXT.test(title) && MATERIAL_OUTCOME.test(title)) return 'trial_result'
  if (CLINICAL_CONTEXT.test(title) && TRIAL_START.test(title)) return 'trial_start'
  if (MEDICAL_MEETING.test(title) && CLINICAL_CONTEXT.test(title)) return 'medical_meeting'
  return null
}

function catalystOutcome(title: string): ClinicalCatalystOutcome {
  if (MIXED.test(title)) return 'mixed'
  if (NEGATIVE.test(title)) return 'negative'
  if (POSITIVE.test(title)) return 'positive'
  if (TRIAL_START.test(title) || MEDICAL_MEETING.test(title)) return 'pending'
  return 'unknown'
}

function materiality(kind: ClinicalCatalystKind, phase: string | null, outcome: ClinicalCatalystOutcome): number {
  if (kind === 'clinical_hold' || kind === 'safety_signal') return 90
  if (kind === 'regulatory_decision') return 92
  if (kind === 'trial_result' && phase?.includes('3')) return 90
  if (kind === 'trial_result' && phase?.includes('2')) return 75
  if (kind === 'trial_result') return outcome === 'positive' || outcome === 'negative' ? 68 : 58
  if (kind === 'trial_start' && phase?.includes('3')) return 64
  if (kind === 'medical_meeting') return 55
  return 45
}

function significanceFor(score: number, kind: ClinicalCatalystKind): ClinicalCatalystSignificance {
  if (score >= 85 || kind === 'clinical_hold' || kind === 'regulatory_decision') return 'urgent'
  if (score >= 60) return 'investigate'
  return 'monitor'
}

function trialIdentifier(title: string): string | null {
  return title.match(/\bNCT\d{8}\b/i)?.[0].toUpperCase()
    ?? title.match(/\b[A-Z][A-Za-z]+-?\d{2,4}\b/)?.[0]
    ?? null
}

function therapyName(title: string): string | null {
  const value = THERAPY_PATTERNS.map((pattern) => title.match(pattern)?.[0]).find((item): item is string => Boolean(item)) ?? null
  if (value && /^(?:intismeran autogene|intismeran|mRNA-4157|V940)$/i.test(value)) return 'intismeran'
  if (/\bmoderna\b/i.test(title) && /\b(?:melanoma|cancer vaccine)\b/i.test(title)) return 'intismeran'
  return value
}

function indicationName(title: string): string | null {
  const lower = title.toLowerCase()
  return INDICATIONS.find((indication) => lower.includes(indication)) ?? (lower.includes('cancer') ? 'cancer' : null)
}

export function isClinicalCatalystTitle(title: string): boolean {
  return catalystKind(title) !== null
}

export function normalizeClinicalCatalyst(source: ClinicalCatalystSource): ClinicalCatalyst | null {
  const kind = catalystKind(source.title)
  if (!kind) return null
  const therapy = therapyName(source.title)
  const indication = indicationName(source.title)
  const phase = clinicalPhase(source.title) ?? (therapy === 'intismeran' && indication === 'melanoma' ? 'Phase 3' : null)
  const outcome = catalystOutcome(source.title)
  const score = materiality(kind, phase, outcome)
  const significance = significanceFor(score, kind)
  const trialId = trialIdentifier(source.title)
  const symbols = sourceSymbol(source.metadata)
  const identity = therapy || indication
    ? [kind, therapy, indication, phase, outcome].filter(Boolean).map(String).map(normalized).join('|')
    : [kind, trialId, phase, outcome, source.title].filter(Boolean).map(String).map(normalized).join('|')
  const fingerprint = createHash('sha256').update(identity || normalized(source.title)).digest('hex')
  const channels = [
    'clinical_evidence',
    ...(kind === 'regulatory_decision' || kind === 'clinical_hold' ? ['regulatory_probability'] : []),
    ...(phase?.includes('3') || kind === 'regulatory_decision' ? ['commercial_probability'] : []),
    ...(/\b(?:platform|first of its kind|mRNA|gene therap|cell therap)\b/i.test(source.title) ? ['platform_validation'] : []),
  ]
  return {
    fingerprint,
    title: source.title.trim(),
    url: source.url,
    publisher: source.publisher,
    sourceId: source.id,
    feedItemId: source.feedItemId ?? null,
    documentId: source.documentId ?? null,
    publishedAt: source.publishedAt,
    fetchedAt: source.fetchedAt,
    kind,
    outcome,
    significance,
    phase,
    trialId,
    therapy,
    indication,
    symbols,
    materiality: score,
    timeSensitivity: significance === 'urgent' ? 90 : significance === 'investigate' ? 65 : 35,
    economicChannels: [...new Set(channels)],
    decisiveNewEvent: significance === 'urgent',
    summary: [phase, therapy, indication, outcome !== 'unknown' ? `${outcome} ${kind.replaceAll('_', ' ')}` : kind.replaceAll('_', ' ')].filter(Boolean).join(' · '),
  }
}

export function clinicalCatalystClusterKey(title: string): string | null {
  const source: ClinicalCatalystSource = { id: 'key', title, url: 'https://example.invalid', publisher: '', publishedAt: null, fetchedAt: new Date(0).toISOString() }
  const catalyst = normalizeClinicalCatalyst(source)
  if (!catalyst) return null
  return [catalyst.kind, catalyst.therapy, catalyst.indication, catalyst.phase, catalyst.outcome]
    .filter(Boolean).map(String).map(normalized).join('|')
}
