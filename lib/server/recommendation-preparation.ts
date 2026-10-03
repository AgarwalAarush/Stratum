import { decisionContextSignature } from '../markets/decision-refresh.ts'
import { MARKETS_OWNER_ID } from '../auth/markets-auth.ts'
import { seedDecisionResearch } from './interest-coverage.ts'
import { investigationDate } from './research-investigations.ts'
import { isRobinhoodPortfolioSyncConfigured } from './robinhood-portfolio-sync.ts'
import { assembleDecisionContext, contentHash, generateDailyRecommendations, investmentDb, record } from './recommendations.ts'
import type { AgentJobType } from './agent-job-contracts.ts'

type Enqueue = (type: AgentJobType, payload: Record<string, unknown>, key: string, options?: {runAfter?:Date}) => Promise<{id:string;deduplicated:boolean}>

/** Probe without persisting, repair sources, then freeze a new immutable edition. */
export async function prepareDailyRecommendations(ownerId: string, editionKey: string, enqueue: Enqueue, now = new Date()) {
  const context = await assembleDecisionContext(ownerId, now, editionKey, {persist:false})
  const dependencies: string[] = []
  const queue = async (type: AgentJobType, payload: Record<string,unknown>, key: string) => {
    const job = await enqueue(type,payload,key)
    dependencies.push(job.id)
  }
  const portfolios = context.portfolio as Array<{account:{kind:string};dataAsOf:string|null}>
  const stale = (asOf: unknown) => typeof asOf !== 'string' || !Number.isFinite(Date.parse(asOf)) || now.getTime()-Date.parse(asOf)>96*3600000
  if (portfolios.some(p => p.account.kind === 'brokerage' && stale(p.dataAsOf)) && isRobinhoodPortfolioSyncConfigured())
    await queue('sync-robinhood-portfolio',{slot:'final',ownerId},`recommendation-broker:${ownerId}:${context.date}:${editionKey}`)
  if (!context.market || stale(record(context.market).data_as_of))
    await queue('refresh-market-screener',{mode:'daily'},`recommendation-market:${context.date}:${editionKey}`)
  // Dated future upgrades remain visible without holding today's edition for days.
  const plan = await seedDecisionResearch(ownerId,enqueue,now,{refreshMembership:false,backfillAll:true})
  dependencies.push(...plan.queued.filter(j=>j.date===investigationDate(now)).map(j=>j.jobId))
  const pending = await investmentDb().from('agent_jobs').select('id,run_after').contains('payload',{ownerId})
    .in('job_type',['generate-company-research','generate-etf-research','event-refresh-company-research'])
    .in('status',['queued','running'])
  if(pending.error) throw new Error(pending.error.message)
  for(const job of pending.data) if(investigationDate(new Date(job.run_after))<=investigationDate(now)&&!dependencies.includes(job.id)) dependencies.push(job.id)
  if (!dependencies.length) return generateDailyRecommendations(ownerId,now,editionKey)
  const db = investmentDb()
  const priority = await db.from('agent_jobs').update({priority:12}).in('id',dependencies).eq('status','queued').gt('priority',12)
  if (priority.error) throw new Error(priority.error.message)
  const readyKey = `${editionKey}:prepared:${contentHash(dependencies).slice(0,16)}`
  const next = await enqueue('generate-daily-recommendations', {ownerId,editionKey:readyKey,phase:'publish',dependencyJobIds:dependencies},
    `recommendation-publish:${ownerId}:${context.date}:${readyKey}`)
  return {preparing:true,dependencyCount:dependencies.length,continuationJobId:next.id}
}

/** Source completions do not mutate an earlier cutoff. Catch up after a
 * repair, owner confirmation, or later broker capture using a fresh edition. */
export async function reconcileRecommendationEvidence(enqueue: Enqueue, ownerId = MARKETS_OWNER_ID) {
  const db = investmentDb(), signal = AbortSignal.timeout(15_000)
  const active = await db.from('agent_jobs').select('payload').eq('job_type','generate-daily-recommendations')
    .or(`payload->>ownerId.eq.${ownerId},payload->>ownerId.is.null`)
    .in('status',['queued','running']).limit(100).abortSignal(signal)
  if (active.error) throw new Error(active.error.message)
  if (active.data.some(job => !record(job.payload).ownerId || record(job.payload).ownerId === ownerId)) return null
  const batch = await db.from('recommendation_batches').select('manifest_id').eq('owner_id',ownerId)
    .order('published_at',{ascending:false}).limit(1).abortSignal(signal).maybeSingle()
  if (batch.error) throw new Error(batch.error.message)
  if (!batch.data) return null
  const manifest = await db.from('recommendation_input_manifests').select('content')
    .eq('id',batch.data.manifest_id).eq('owner_id',ownerId).abortSignal(signal).single()
  if (manifest.error) throw new Error(manifest.error.message)
  const current=await assembleDecisionContext(ownerId,new Date(),'semantic-probe',{persist:false})
  const previous=record(manifest.data.content)
  const signature=decisionContextSignature(current)
  if (Array.isArray(previous.names) && decisionContextSignature(previous as unknown as import('../markets/recommendations.ts').DecisionContext)===signature) return null
  const editionKey=`evidence:${signature.slice(0,24)}`
  return enqueue('generate-daily-recommendations',{ownerId,editionKey},`recommendation-evidence:${ownerId}:${editionKey}`)
}
