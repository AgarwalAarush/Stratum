import { parseHTML } from 'linkedom'
import type { WorldObservationInput } from './world-memory.ts'

export interface WorldSourceAdapter {
  id: string
  label: string
  domain: string
  cadence: 'daily' | 'weekly'
  sourceIds: string[]
  ingest: (options?: { fetchImpl?: typeof fetch }) => Promise<WorldSourceIngestResult>
}

export interface WorldSourceIngestResult {
  observations: WorldObservationInput[]
  failures: Array<{ sourceId: string; message: string }>
}

interface AiPowerSourceSpec {
  id: string
  title: string
  url: string
  publisher: string
  sourceTier: WorldObservationInput['sourceTier']
  assertion: string
  kind: WorldObservationInput['kind']
  mechanism: string
  entities: NonNullable<WorldObservationInput['entities']>
  geography?: string
  numericValue?: number
  numericUnit?: string
  publishedAt?: string
  confidence: number
  materiality: number
  novelty: number
}

/**
 * These are stable, first-class documents for the first market-memory vertical.
 * The assertion is intentionally modest and tied to the cited document. This is
 * an adapter catalogue, not a hidden thesis: later synthesis must still connect
 * demand, supply, constraints, economics, and the counter-case.
 */
export const AI_POWER_SOURCE_SPECS: AiPowerSourceSpec[] = [
  {
    id: 'eia-data-center-load',
    title: 'Data center server energy use grows across the commercial building stock',
    url: 'https://www.eia.gov/todayinenergy/detail.php?id=67704',
    publisher: 'U.S. Energy Information Administration', sourceTier: 'regulatory',
    assertion: 'EIA projects data-center server electricity use to increase across the commercial building stock; server load is effectively flat across hours of the day.',
    kind: 'estimate', mechanism: 'data_center_load',
    entities: [{ kind: 'industry', name: 'Data centers' }, { kind: 'industry', name: 'AI infrastructure' }, { kind: 'jurisdiction', name: 'United States' }],
    numericValue: 7, numericUnit: 'percent of commercial electricity consumption in 2025', publishedAt: '2026-05-19T00:00:00.000Z',
    confidence: 88, materiality: 92, novelty: 78,
  },
  {
    id: 'eia-deliverable-capacity',
    title: 'Fossil generation could rise with faster-than-expected growth in data center power demand',
    url: 'https://www.eia.gov/TODAYINENERGY/detail.php?id=67344',
    publisher: 'U.S. Energy Information Administration', sourceTier: 'regulatory',
    assertion: 'EIA finds that long lead times for planning, construction, and interconnection make it unlikely that additional generating capacity becomes operational within the short-term forecast window beyond announced additions.',
    kind: 'estimate', mechanism: 'firm_capacity_constraint',
    entities: [{ kind: 'industry', name: 'Electric power generation' }, { kind: 'industry', name: 'Data centers' }, { kind: 'jurisdiction', name: 'United States' }],
    publishedAt: '2026-03-12T00:00:00.000Z', confidence: 86, materiality: 89, novelty: 76,
  },
  {
    id: 'ferc-large-load-integration',
    title: 'FERC order on large-load interconnection',
    url: 'https://www.ferc.gov/sites/default/files/2026-06/EL26-68-000.pdf',
    publisher: 'Federal Energy Regulatory Commission', sourceTier: 'regulatory',
    assertion: 'FERC records that data centers and other large loads are connecting rapidly to the transmission system and that large-load interconnection procedures require reform, making interconnection design a live constraint rather than a background assumption.',
    kind: 'fact', mechanism: 'interconnection_constraint',
    entities: [{ kind: 'regulator', name: 'Federal Energy Regulatory Commission', aliases: ['FERC'] }, { kind: 'industry', name: 'Data centers' }, { kind: 'jurisdiction', name: 'United States' }],
    publishedAt: '2026-06-18T00:00:00.000Z', confidence: 92, materiality: 90, novelty: 85,
  },
  {
    id: 'doe-transformer-supply',
    title: 'Department of Energy supply chain and market analysis',
    url: 'https://www.energy.gov/oe/supply-chain-and-market-analysis',
    publisher: 'U.S. Department of Energy', sourceTier: 'regulatory',
    assertion: 'DOE reports that distribution-transformer lead times rose from three to six months in 2019 to 12 to 30 months in 2023, illustrating how electrical-equipment availability can delay grid build-out.',
    kind: 'fact', mechanism: 'equipment_lead_time',
    entities: [{ kind: 'industry', name: 'Electrical equipment' }, { kind: 'technology', name: 'Distribution transformers' }, { kind: 'jurisdiction', name: 'United States' }],
    numericValue: 12, numericUnit: 'months lower end of distribution-transformer lead-time range', publishedAt: '2026-03-05T00:00:00.000Z',
    confidence: 84, materiality: 80, novelty: 65,
  },
  {
    id: 'nerc-ltra-large-loads',
    title: 'NERC 2025 Long-Term Reliability Assessment',
    url: 'https://www.nerc.com/globalassets/our-work/assessments/nerc_ltra_2025.pdf',
    publisher: 'North American Electric Reliability Corporation', sourceTier: 'independent',
    assertion: 'NERC forecasts 224 GW of North American summer-peak demand growth over the next decade and identifies new data centers for AI and the digital economy as the principal source of the projected increase.',
    kind: 'estimate', mechanism: 'firm_capacity_constraint',
    entities: [{ kind: 'industry', name: 'Data centers' }, { kind: 'industry', name: 'Electric power generation' }, { kind: 'jurisdiction', name: 'North America' }],
    numericValue: 224, numericUnit: 'GW projected summer peak demand growth over ten years', publishedAt: '2026-02-24T00:00:00.000Z',
    confidence: 86, materiality: 91, novelty: 82,
  },
]

function readableText(raw: string, contentType: string): string {
  if (/html|xml/i.test(contentType) || /<html|<body|<article/i.test(raw)) {
    const { document } = parseHTML(raw)
    document.querySelectorAll('script,style,noscript,svg,nav,footer,header').forEach((node) => node.remove())
    return (document.querySelector('article, main')?.textContent ?? document.body?.textContent ?? raw)
      .replace(/\s+/g, ' ').trim()
  }
  return raw.replace(/\s+/g, ' ').trim()
}

async function extractPdfText(raw: Buffer): Promise<string> {
  // This is a worker-only dynamic import. Unlike spawning `pdftotext`, it keeps
  // the source adapter portable across a fresh macserver or future Linux host.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs') as {
    getDocument: (options: { data: Uint8Array }) => { promise: Promise<{ numPages: number; getPage: (page: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }> }> }
  }
  const document = await pdfjs.getDocument({ data: new Uint8Array(raw) }).promise
  const pages = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
    const page = await document.getPage(index + 1)
    const content = await page.getTextContent()
    return content.items.map((item) => item.str ?? '').join(' ')
  }))
  return pages.join('\n').replace(/\s+/g, ' ').trim()
}

function mimeType(response: Response): string {
  return response.headers.get('content-type')?.split(';')[0]?.trim() || 'text/html'
}

function extension(type: string): string {
  if (type.includes('pdf')) return 'pdf'
  if (type.includes('xml')) return 'xml'
  if (type.includes('json')) return 'json'
  return 'html'
}

async function fetchAiPowerSpec(spec: AiPowerSourceSpec, fetchImpl: typeof fetch): Promise<WorldObservationInput> {
  const response = await fetchImpl(spec.url, {
    headers: { 'User-Agent': 'StratumMarketMemory/1.0 (+private research worker)', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.7' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`${spec.id} returned HTTP ${response.status}`)
  const type = mimeType(response)
  const raw = Buffer.from(await response.arrayBuffer())
  const text = type.includes('pdf') ? await extractPdfText(raw) : readableText(raw.toString('utf8'), type)
  if (text.length < 240) throw new Error(`${spec.id} yielded too little readable source text`)
  return {
    title: spec.title, canonicalUrl: response.url || spec.url, publisher: spec.publisher, sourceTier: spec.sourceTier,
    body: text, rawBody: raw, mimeType: type, sourceExtension: extension(type), publishedAt: spec.publishedAt ?? null,
    assertion: spec.assertion, kind: spec.kind, domain: 'ai-power', mechanism: spec.mechanism, entities: spec.entities,
    geography: spec.geography ?? 'United States', numericValue: spec.numericValue ?? null, numericUnit: spec.numericUnit ?? null,
    observedAt: spec.publishedAt ?? new Date().toISOString(), confidence: spec.confidence, materiality: spec.materiality, novelty: spec.novelty,
  }
}

export const aiPowerV1SourceAdapter: WorldSourceAdapter = {
  id: 'ai-power-v1', label: 'AI/power official source packet', domain: 'ai-power', cadence: 'daily', sourceIds: AI_POWER_SOURCE_SPECS.map((item) => item.id),
  async ingest(options = {}) {
    const fetchImpl = options.fetchImpl ?? fetch
    const results = await Promise.allSettled(AI_POWER_SOURCE_SPECS.map((spec) => fetchAiPowerSpec(spec, fetchImpl)))
    const observations = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
    const failures = results.flatMap((result, index) => result.status === 'rejected' ? [{
      sourceId: AI_POWER_SOURCE_SPECS[index]!.id,
      message: result.reason instanceof Error ? result.reason.message : String(result.reason),
    }] : [])
    if (observations.length === 0) {
      throw new Error(`AI/power source adapter did not ingest any documents: ${failures.map((item) => item.message).join('; ')}`)
    }
    return { observations, failures }
  },
}

const WORLD_SOURCE_ADAPTERS: WorldSourceAdapter[] = [aiPowerV1SourceAdapter]

export function getWorldSourceAdapter(id: string): WorldSourceAdapter | null {
  return WORLD_SOURCE_ADAPTERS.find((adapter) => adapter.id === id) ?? null
}
