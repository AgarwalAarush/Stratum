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

interface WorldDocumentSourceSpec {
  id: string
  sourceSlug: string
  domain: string
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
export const AI_POWER_SOURCE_SPECS: WorldDocumentSourceSpec[] = [
  {
    id: 'eia-data-center-load', sourceSlug: 'eia', domain: 'ai-power',
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
    id: 'eia-deliverable-capacity', sourceSlug: 'eia', domain: 'ai-power',
    title: 'Fossil generation could rise with faster-than-expected growth in data center power demand',
    url: 'https://www.eia.gov/TODAYINENERGY/detail.php?id=67344',
    publisher: 'U.S. Energy Information Administration', sourceTier: 'regulatory',
    assertion: 'EIA finds that long lead times for planning, construction, and interconnection make it unlikely that additional generating capacity becomes operational within the short-term forecast window beyond announced additions.',
    kind: 'estimate', mechanism: 'firm_capacity_constraint',
    entities: [{ kind: 'industry', name: 'Electric power generation' }, { kind: 'industry', name: 'Data centers' }, { kind: 'jurisdiction', name: 'United States' }],
    publishedAt: '2026-03-12T00:00:00.000Z', confidence: 86, materiality: 89, novelty: 76,
  },
  {
    id: 'ferc-large-load-integration', sourceSlug: 'ferc', domain: 'ai-power',
    title: 'FERC order on large-load interconnection',
    url: 'https://www.ferc.gov/sites/default/files/2026-06/EL26-68-000.pdf',
    publisher: 'Federal Energy Regulatory Commission', sourceTier: 'regulatory',
    assertion: 'FERC records that data centers and other large loads are connecting rapidly to the transmission system and that large-load interconnection procedures require reform, making interconnection design a live constraint rather than a background assumption.',
    kind: 'fact', mechanism: 'interconnection_constraint',
    entities: [{ kind: 'regulator', name: 'Federal Energy Regulatory Commission', aliases: ['FERC'] }, { kind: 'industry', name: 'Data centers' }, { kind: 'jurisdiction', name: 'United States' }],
    publishedAt: '2026-06-18T00:00:00.000Z', confidence: 92, materiality: 90, novelty: 85,
  },
  {
    id: 'doe-transformer-supply', sourceSlug: 'doe', domain: 'ai-power',
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
    id: 'nerc-ltra-large-loads', sourceSlug: 'nerc', domain: 'ai-power',
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

async function fetchWorldSourceSpec(spec: WorldDocumentSourceSpec, fetchImpl: typeof fetch): Promise<WorldObservationInput> {
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
    sourceSlug: spec.sourceSlug,
    body: text, rawBody: raw, mimeType: type, sourceExtension: extension(type), publishedAt: spec.publishedAt ?? null,
    assertion: spec.assertion, kind: spec.kind, domain: spec.domain, mechanism: spec.mechanism, entities: spec.entities,
    geography: spec.geography ?? 'United States', numericValue: spec.numericValue ?? null, numericUnit: spec.numericUnit ?? null,
    observedAt: spec.publishedAt ?? new Date().toISOString(), confidence: spec.confidence, materiality: spec.materiality, novelty: spec.novelty,
  }
}

export const aiPowerV1SourceAdapter: WorldSourceAdapter = {
  id: 'ai-power-v1', label: 'AI/power official source packet', domain: 'ai-power', cadence: 'daily', sourceIds: AI_POWER_SOURCE_SPECS.map((item) => item.id),
  async ingest(options = {}) {
    const fetchImpl = options.fetchImpl ?? fetch
    const results = await Promise.allSettled(AI_POWER_SOURCE_SPECS.map((spec) => fetchWorldSourceSpec(spec, fetchImpl)))
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

/**
 * First non-power packet. These are company/regulator documents, not a claim
 * that any one issuer is investable. The packet gives the domain’s generic
 * model an auditable demand/supply/constraint ledger before activation.
 */
export const SEMICAP_DATA_CENTER_SOURCE_SPECS: WorldDocumentSourceSpec[] = [
  {
    id: 'nvidia-fy2026-10k', sourceSlug: 'sec-nvidia-fy2026-10k', domain: 'semicap-data-center-equipment',
    title: 'NVIDIA fiscal 2026 annual report', url: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm',
    publisher: 'NVIDIA Corporation', sourceTier: 'primary',
    assertion: 'NVIDIA reports fiscal-2026 Data Center revenue growth of 68% year over year, tying compute and networking demand to accelerated-computing and AI platform adoption.',
    kind: 'fact', mechanism: 'compute_demand', entities: [{ kind: 'company', name: 'NVIDIA', aliases: ['NVDA'] }, { kind: 'industry', name: 'Data centers' }, { kind: 'technology', name: 'Accelerated computing' }],
    geography: 'Global', publishedAt: '2026-02-25T00:00:00.000Z', confidence: 91, materiality: 90, novelty: 74,
  },
  {
    id: 'asml-fy2025-20f', sourceSlug: 'sec-asml-fy2025-20f', domain: 'semicap-data-center-equipment',
    title: 'ASML 2025 annual report on Form 20-F', url: 'https://www.sec.gov/Archives/edgar/data/937966/000162828026011378/asml-20251231.htm',
    publisher: 'ASML Holding N.V.', sourceTier: 'primary',
    assertion: 'ASML reports that advanced logic and DRAM for AI led semiconductor-market growth and that lithography-system output is constrained by critical supplier capacity, including sole-source optics.',
    kind: 'fact', mechanism: 'component_lead_time', entities: [{ kind: 'company', name: 'ASML Holding', aliases: ['ASML'] }, { kind: 'technology', name: 'Lithography systems' }, { kind: 'industry', name: 'Semiconductor equipment' }],
    geography: 'Global', publishedAt: '2026-02-25T00:00:00.000Z', confidence: 92, materiality: 88, novelty: 76,
  },
  {
    id: 'micron-fy2025-10k', sourceSlug: 'sec-micron-fy2025-10k', domain: 'semicap-data-center-equipment',
    title: 'Micron fiscal 2025 annual report', url: 'https://www.sec.gov/Archives/edgar/data/723125/000072312525000040/202510karscopy.pdf',
    publisher: 'Micron Technology', sourceTier: 'primary',
    assertion: 'Micron describes planned advanced-packaging capacity and DRAM/HBM modernization intended to support high-bandwidth memory demand for data-intensive compute systems.',
    kind: 'estimate', mechanism: 'fabrication_capacity', entities: [{ kind: 'company', name: 'Micron Technology', aliases: ['MU'] }, { kind: 'technology', name: 'High Bandwidth Memory', aliases: ['HBM'] }, { kind: 'industry', name: 'Semiconductors' }],
    geography: 'Global', publishedAt: '2025-12-31T00:00:00.000Z', confidence: 85, materiality: 84, novelty: 68,
  },
  {
    id: 'bis-semiconductor-export-policy', sourceSlug: 'bis-semiconductor-export-policy', domain: 'semicap-data-center-equipment',
    title: 'BIS semiconductor export license-review policy revision', url: 'https://www.bis.gov/sites/default/files/documents/DoC%20Revises%20License%20Review%20Policy%20for%20Semiconductors%20Exports.pdf',
    publisher: 'U.S. Bureau of Industry and Security', sourceTier: 'regulatory',
    assertion: 'BIS revised semiconductor export licensing policy, showing that trade controls can alter accessible demand, supplier economics, and regional supply-chain allocation.',
    kind: 'fact', mechanism: 'supply_chain_capture', entities: [{ kind: 'regulator', name: 'U.S. Bureau of Industry and Security', aliases: ['BIS'] }, { kind: 'industry', name: 'Semiconductors' }, { kind: 'jurisdiction', name: 'United States' }],
    geography: 'United States', publishedAt: '2026-01-13T00:00:00.000Z', confidence: 89, materiality: 77, novelty: 72,
  },
]

export const semicapDataCenterV1SourceAdapter: WorldSourceAdapter = {
  id: 'semicap-data-center-v1', label: 'Semicap/data-center primary source packet', domain: 'semicap-data-center-equipment', cadence: 'weekly', sourceIds: SEMICAP_DATA_CENTER_SOURCE_SPECS.map((item) => item.id),
  async ingest(options = {}) {
    const fetchImpl = options.fetchImpl ?? fetch
    const results = await Promise.allSettled(SEMICAP_DATA_CENTER_SOURCE_SPECS.map((spec) => fetchWorldSourceSpec(spec, fetchImpl)))
    const observations = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
    const failures = results.flatMap((result, index) => result.status === 'rejected' ? [{ sourceId: SEMICAP_DATA_CENTER_SOURCE_SPECS[index]!.id, message: result.reason instanceof Error ? result.reason.message : String(result.reason) }] : [])
    if (observations.length === 0) throw new Error(`Semicap/data-center source adapter did not ingest any documents: ${failures.map((item) => item.message).join('; ')}`)
    return { observations, failures }
  },
}

/**
 * Critical materials is deliberately a supply-chain packet, not a commodity
 * price call. The four documents map the domain's independent mechanisms and
 * retain the limits of government assessments and issuer disclosures.
 */
export const CRITICAL_MATERIALS_SOURCE_SPECS: WorldDocumentSourceSpec[] = [
  {
    id: 'usgs-mcs-2026', sourceSlug: 'usgs-mcs-2026', domain: 'critical-materials',
    title: 'U.S. Geological Survey Mineral Commodity Summaries 2026', url: 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026.pdf',
    publisher: 'U.S. Geological Survey', sourceTier: 'regulatory',
    assertion: 'USGS Mineral Commodity Summaries 2026 provides the government\'s early production, reserve, import-reliance, and trade context for critical minerals, including rare earth materials.',
    kind: 'fact', mechanism: 'trade_constraint', entities: [{ kind: 'regulator', name: 'U.S. Geological Survey', aliases: ['USGS'] }, { kind: 'industry', name: 'Critical minerals' }, { kind: 'jurisdiction', name: 'United States' }],
    geography: 'United States and global', publishedAt: '2026-02-06T00:00:00.000Z', confidence: 90, materiality: 87, novelty: 70,
  },
  {
    id: 'doe-critical-materials-assessment', sourceSlug: 'doe-critical-materials-assessment', domain: 'critical-materials',
    title: 'Department of Energy critical minerals and materials assessment', url: 'https://www.energy.gov/cmm/what-are-critical-minerals-and-materials',
    publisher: 'U.S. Department of Energy', sourceTier: 'regulatory',
    assertion: 'DOE\'s critical-materials methodology assesses supply-disruption risk alongside energy-technology importance and explicitly includes substitutability in its supply-risk framing.',
    kind: 'fact', mechanism: 'substitution', entities: [{ kind: 'regulator', name: 'U.S. Department of Energy', aliases: ['DOE'] }, { kind: 'industry', name: 'Critical materials' }, { kind: 'technology', name: 'Energy technologies' }],
    geography: 'Global', publishedAt: '2026-06-02T00:00:00.000Z', confidence: 86, materiality: 80, novelty: 65,
  },
  {
    id: 'mp-materials-2025-10k', sourceSlug: 'sec-mp-materials-2025-10k', domain: 'critical-materials',
    title: 'MP Materials fiscal 2025 annual report', url: 'https://www.sec.gov/Archives/edgar/data/1801368/000180136826000008/mp-20251231.htm',
    publisher: 'MP Materials Corp.', sourceTier: 'primary',
    assertion: 'MP Materials reports record upstream concentrate production in 2025 and continued investment in Mountain Pass and downstream rare-earth and magnet capacity.',
    kind: 'fact', mechanism: 'resource_supply', entities: [{ kind: 'company', name: 'MP Materials', aliases: ['MP'] }, { kind: 'facility', name: 'Mountain Pass' }, { kind: 'commodity', name: 'Rare earth materials' }],
    geography: 'United States', publishedAt: '2026-02-26T00:00:00.000Z', confidence: 89, materiality: 84, novelty: 72,
  },
  {
    id: 'lynas-fy2025-annual-report', sourceSlug: 'lynas-fy2025-annual-report', domain: 'critical-materials',
    title: 'Lynas Rare Earths FY2025 annual report', url: 'https://announcements.asx.com.au/asxpdf/20250828/pdf/06ngtkbmf2fb5g.pdf',
    publisher: 'Lynas Rare Earths Limited', sourceTier: 'primary',
    assertion: 'Lynas reports separated heavy-rare-earth oxide production and expansion of rare-earth processing capacity outside China, while noting the market and execution limits around the build-out.',
    kind: 'fact', mechanism: 'processing_concentration', entities: [{ kind: 'company', name: 'Lynas Rare Earths', aliases: ['LYC'] }, { kind: 'commodity', name: 'Rare earth oxides' }, { kind: 'industry', name: 'Rare earth processing' }],
    geography: 'Australia and Malaysia', publishedAt: '2025-08-28T00:00:00.000Z', confidence: 86, materiality: 82, novelty: 66,
  },
]

export const criticalMaterialsV1SourceAdapter: WorldSourceAdapter = {
  id: 'critical-materials-v1', label: 'Critical materials primary source packet', domain: 'critical-materials', cadence: 'weekly', sourceIds: CRITICAL_MATERIALS_SOURCE_SPECS.map((item) => item.id),
  async ingest(options = {}) {
    const fetchImpl = options.fetchImpl ?? fetch
    const results = await Promise.allSettled(CRITICAL_MATERIALS_SOURCE_SPECS.map((spec) => fetchWorldSourceSpec(spec, fetchImpl)))
    const observations = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
    const failures = results.flatMap((result, index) => result.status === 'rejected' ? [{ sourceId: CRITICAL_MATERIALS_SOURCE_SPECS[index]!.id, message: result.reason instanceof Error ? result.reason.message : String(result.reason) }] : [])
    if (observations.length === 0) throw new Error(`Critical-materials source adapter did not ingest any documents: ${failures.map((item) => item.message).join('; ')}`)
    return { observations, failures }
  },
}

/**
 * Macro is a transmission packet: policy, financial conditions, real-economy
 * cross-border data, and surveyed expectations remain distinct inputs. It is
 * intentionally not a headline or geopolitical-news feed.
 */
export const MACRO_POLICY_GEOPOLITICS_SOURCE_SPECS: WorldDocumentSourceSpec[] = [
  {
    id: 'fed-fomc-june-2026', sourceSlug: 'fed-fomc-june-2026', domain: 'macro-policy-geopolitics',
    title: 'Federal Reserve FOMC statement, June 17 2026', url: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260617a.htm',
    publisher: 'Board of Governors of the Federal Reserve System', sourceTier: 'regulatory',
    assertion: 'The Federal Open Market Committee maintained the federal funds target range at 3.5 to 3.75 percent in June 2026 and stated that it would assess incoming data, the evolving outlook, and risks when considering further adjustments.',
    kind: 'fact', mechanism: 'policy_change', entities: [{ kind: 'regulator', name: 'Federal Open Market Committee', aliases: ['FOMC'] }, { kind: 'jurisdiction', name: 'United States' }],
    geography: 'United States', publishedAt: '2026-06-17T18:00:00.000Z', confidence: 96, materiality: 92, novelty: 70,
  },
  {
    id: 'chicago-fed-nfci', sourceSlug: 'chicago-fed-nfci', domain: 'macro-policy-geopolitics',
    title: 'Chicago Fed National Financial Conditions Index current data', url: 'https://www.chicagofed.org/research/data/nfci/current-data',
    publisher: 'Federal Reserve Bank of Chicago', sourceTier: 'regulatory',
    assertion: 'The Chicago Fed describes the National Financial Conditions Index as a weekly measure of U.S. financial conditions across money, debt, equity, and banking markets; revisions and changing indicator weights remain explicit limitations.',
    kind: 'fact', mechanism: 'financial_conditions', entities: [{ kind: 'regulator', name: 'Federal Reserve Bank of Chicago', aliases: ['Chicago Fed'] }, { kind: 'dataset', name: 'National Financial Conditions Index', aliases: ['NFCI'] }, { kind: 'jurisdiction', name: 'United States' }],
    geography: 'United States', confidence: 90, materiality: 84, novelty: 60,
  },
  {
    id: 'census-international-trade-current', sourceSlug: 'census-international-trade-current', domain: 'macro-policy-geopolitics',
    title: 'U.S. International Trade in Goods and Services, current release', url: 'https://www.census.gov/foreign-trade/current/index.html',
    publisher: 'U.S. Census Bureau and Bureau of Economic Analysis', sourceTier: 'regulatory',
    assertion: 'The Census Bureau and Bureau of Economic Analysis publish monthly goods and services trade data, including imports and exports, as direct operational evidence for cross-border economic transmission rather than a conclusion about a specific policy outcome.',
    kind: 'fact', mechanism: 'supply_chain_disruption', entities: [{ kind: 'regulator', name: 'U.S. Census Bureau' }, { kind: 'regulator', name: 'Bureau of Economic Analysis', aliases: ['BEA'] }, { kind: 'industry', name: 'International trade' }, { kind: 'jurisdiction', name: 'United States' }],
    geography: 'United States and global', publishedAt: '2026-07-07T12:30:00.000Z', confidence: 93, materiality: 83, novelty: 64,
  },
  {
    id: 'nyfed-survey-market-expectations', sourceSlug: 'nyfed-survey-market-expectations', domain: 'macro-policy-geopolitics',
    title: 'New York Fed Survey of Market Expectations', url: 'https://www.newyorkfed.org/markets/market-intelligence/survey-of-market-expectations',
    publisher: 'Federal Reserve Bank of New York', sourceTier: 'regulatory',
    assertion: 'The New York Fed Survey of Market Expectations surveys primary dealers and market participants before FOMC meetings on the outlook, monetary policy, and financial markets; surveyed expectations are evidence of beliefs, not a factual substitute for outcomes.',
    kind: 'estimate', mechanism: 'expectations_shift', entities: [{ kind: 'regulator', name: 'Federal Reserve Bank of New York', aliases: ['New York Fed'] }, { kind: 'dataset', name: 'Survey of Market Expectations' }, { kind: 'jurisdiction', name: 'United States' }],
    geography: 'United States', confidence: 87, materiality: 82, novelty: 62,
  },
]

export const macroPolicyGeopoliticsV1SourceAdapter: WorldSourceAdapter = {
  id: 'macro-policy-geopolitics-v1', label: 'Macro/policy official transmission packet', domain: 'macro-policy-geopolitics', cadence: 'weekly', sourceIds: MACRO_POLICY_GEOPOLITICS_SOURCE_SPECS.map((item) => item.id),
  async ingest(options = {}) {
    const fetchImpl = options.fetchImpl ?? fetch
    const results = await Promise.allSettled(MACRO_POLICY_GEOPOLITICS_SOURCE_SPECS.map((spec) => fetchWorldSourceSpec(spec, fetchImpl)))
    const observations = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
    const failures = results.flatMap((result, index) => result.status === 'rejected' ? [{ sourceId: MACRO_POLICY_GEOPOLITICS_SOURCE_SPECS[index]!.id, message: result.reason instanceof Error ? result.reason.message : String(result.reason) }] : [])
    if (observations.length === 0) throw new Error(`Macro/policy source adapter did not ingest any documents: ${failures.map((item) => item.message).join('; ')}`)
    return { observations, failures }
  },
}

const WORLD_SOURCE_ADAPTERS: WorldSourceAdapter[] = [aiPowerV1SourceAdapter, semicapDataCenterV1SourceAdapter, criticalMaterialsV1SourceAdapter, macroPolicyGeopoliticsV1SourceAdapter]

export function getWorldSourceAdapter(id: string): WorldSourceAdapter | null {
  return WORLD_SOURCE_ADAPTERS.find((adapter) => adapter.id === id) ?? null
}

/** The adapter registry is separate from admission; schedulers select only
 * adapters for domains that are active in durable source-control state. */
export function listWorldSourceAdapters(): readonly WorldSourceAdapter[] {
  return WORLD_SOURCE_ADAPTERS
}
