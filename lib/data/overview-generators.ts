import type { OverviewData } from '../types.ts'
import { getSupabaseClient } from '../server/supabase.ts'
import { generateCitedBriefing, expandBriefingCitations, type BriefingSource } from './cited-briefing.ts'
import { fetchDailyOverviews, fetchGlobalNewsDailyOverviews, fetchWeeklyOverviews, fetchLatestOverview, saveOverview } from './overview-persistence.ts'

interface PeriodData {
 dailies: Awaited<ReturnType<typeof fetchDailyOverviews>>
 globalNewsDailies: Awaited<ReturnType<typeof fetchGlobalNewsDailyOverviews>>
 weeklies?: Awaited<ReturnType<typeof fetchWeeklyOverviews>>
 previousMonthly?: Awaited<ReturnType<typeof fetchLatestOverview>>
}
interface PeriodOptions {
 now?: Date
 provider?: 'responses' | 'codex'
 loadData?: (startDate: string, endDate: string) => Promise<PeriodData>
 persist?: typeof saveOverview
}

function period(cadence: 'weekly' | 'monthly', now: Date) {
 const end = new Date(now), start = new Date(now)
 if (cadence === 'weekly') {
  start.setUTCDate(now.getUTCDate() - (now.getUTCDay() || 7) - 6)
  end.setUTCDate(start.getUTCDate() + 6)
 } else start.setUTCDate(now.getUTCDate() - 30)
 const startDate = start.toISOString().slice(0,10), endDate = end.toISOString().slice(0,10)
 return { startDate, endDate, date: cadence === 'weekly' ? startDate : endDate }
}

export function selectPeriodEvidence(data: PeriodData): BriefingSource[] {
 const ledger = [...data.dailies, ...data.globalNewsDailies].flatMap(d => d.sources ?? [])
 return [...new Map(ledger.filter(s => s.title && /^https?:\/\//.test(s.url) && s.availableAt).map(s => [s.url, s])).values()]
  .slice(0,300).map((s,i) => ({ ...s, id: String(i+1) }))
}

async function generatePeriodOverview(cadence: 'weekly' | 'monthly', options: PeriodOptions = {}) {
 if (options.provider !== 'codex' && !process.env.OPENAI_API_KEY) return { success: false, error: 'No OpenAI API key' }
 const now = options.now ?? new Date(), stamp = now.toISOString()
 const { startDate, endDate, date } = period(cadence,now)
 const data: PeriodData = options.loadData ? await options.loadData(startDate,endDate) : await Promise.all([
  fetchDailyOverviews(startDate,endDate), fetchGlobalNewsDailyOverviews(startDate,endDate),
  fetchWeeklyOverviews(startDate,endDate), cadence === 'monthly' ? fetchLatestOverview('monthly') : Promise.resolve(null),
 ]).then(([dailies,globalNewsDailies,weeklies,previousMonthly]) => ({ dailies,globalNewsDailies,weeklies,previousMonthly }))
 const sources = selectPeriodEvidence(data).filter(s => !s.availableAt || Date.parse(s.availableAt) <= now.getTime())
 const metadata: OverviewData = { bullets: [], fetchedAt: stamp, generatedAt: null, dataAsOf: null, readiness: 'blocked',
  sources: sources.map(s => ({ ...s, publishedAt: s.publishedAt ?? null, availableAt: s.availableAt!, retrievedAt: s.retrievedAt ?? stamp, section: s.section ?? 'period evidence' })),
  sourceCoverage: [...data.dailies, ...data.globalNewsDailies].flatMap(d => d.sourceCoverage ?? []), errors: [] }
 const recordAttempt = async () => {
  // Injected persistence is an isolated fixture; production always records accepted and failed attempts.
  if (options.persist) return
  const db = getSupabaseClient()
  if (!db) throw new Error('Supabase service credentials are not configured')
  const attempt = await db.from('intelligence_generation_attempts').insert({ type: cadence, readiness: metadata.readiness, metadata })
  if (attempt.error) throw new Error(`Unable to record briefing attempt: ${attempt.error.message}`)
 }
 if (!sources.length) {
  metadata.errors = ['No usable underlying source evidence found for the period']; await recordAttempt()
  return { success: false, error: metadata.errors[0] }
 }
 const schema = { type:'object', properties:{content:{type:'string',minLength:1,maxLength:16000}}, required:['content'], additionalProperties:false }
 try {
  const result = await generateCitedBriefing({ cadence, topic: 'intelligence', sources, provider: options.provider,
   comparison: JSON.stringify({ earlierWeeklies: data.weeklies ?? [], previousMonthly: data.previousMonthly ?? null }),
   instructions: `Cover material changes during ${startDate} through ${endDate}, contrary evidence, connections justified by the sources, and useful watch questions. Return concise markdown in content. Every substantive paragraph and bullet needs [n] citations; headings need none.`,
   schema, schemaPath:'schemas/periodic-overview.schema.json',
   validate: value => { const content = (value as {content?:unknown})?.content; if (typeof content !== 'string' || !content.trim() || content.length>16000) throw new Error('Invalid periodic briefing'); return {content} },
   claims: data => data.content.split(/\n\s*\n/).flatMap(p => p.split('\n').filter(line => line.trim() && !/^\s*#/.test(line))),
  })
  const content = expandBriefingCitations(result.data.content,sources)
  metadata.generatedAt = stamp; metadata.dataAsOf = sources.flatMap(s => s.publishedAt ? [s.publishedAt] : []).sort().at(-1) ?? null
  metadata.errors = metadata.sourceCoverage?.filter(s => s.status !== 'complete').map(s => `${s.source}: ${s.status}`) ?? []
  metadata.readiness = metadata.errors.length ? 'partial' : 'complete'; metadata.generation = result.metadata
  await recordAttempt()
  await (options.persist ?? saveOverview)(cadence,content,date,startDate,endDate,metadata)
  return { success:true,content,date }
 } catch(error) {
  metadata.readiness='failed'; metadata.generatedAt=null; metadata.errors=[error instanceof Error ? error.message : String(error)]
  await recordAttempt(); return {success:false,error:metadata.errors[0]}
 }
}

export function generateWeeklyOverview(options: PeriodOptions = {}) { return generatePeriodOverview('weekly',options) }
export function generateMonthlyOverview(options: PeriodOptions = {}) { return generatePeriodOverview('monthly',options) }
