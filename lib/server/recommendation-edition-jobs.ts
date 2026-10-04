import { assessmentKey, combineFrozenAssessments, partitionAssessmentNames, RECOMMENDATION_ASSESSMENT_VERSION, selectAssessmentNames, type FrozenAssessment } from '../markets/recommendation-assessments.ts'
import type { DecisionContext } from '../markets/recommendations.ts'
import { FORECAST_REVIEW_POLICY } from '../markets/forecast-review.ts'
import { assessFrozenRecommendations, assembleDecisionContext, contentHash, investmentDb, publishFrozenRecommendations, record, renewFrozenRecommendations } from './recommendations.ts'
import type { AgentJobType } from './agent-job-contracts.ts'

export type RecommendationEnqueue = (type: AgentJobType, payload: Record<string,unknown>, key: string) => Promise<{id:string;deduplicated:boolean}>

async function loadFrozenContext(ownerId: string, manifestId: string): Promise<DecisionContext> {
  const result=await investmentDb().from('recommendation_input_manifests').select('content,content_hash').eq('id',manifestId).eq('owner_id',ownerId).single()
  if(result.error) throw new Error(`Unable to read frozen assessment manifest: ${result.error.message}`)
  const context=result.data.content as unknown as DecisionContext
  if(context.ownerId!==ownerId||context.id!==manifestId||contentHash(context)!==result.data.content_hash) throw new Error('Frozen assessment owner or integrity check failed')
  return context
}

/** Freeze once and dispatch small, independently reviewed durable assessments.
 * Restarts reuse successful job outputs and the same immutable cutoff. */
export async function startRecommendationEdition(ownerId: string, now: Date, editionKey: string, enqueue: RecommendationEnqueue) {
  const db=investmentDb(),context=await assembleDecisionContext(ownerId,now,editionKey)
  const prior=await db.from('recommendation_batches').select('id').eq('manifest_id',context.id).maybeSingle()
  if(prior.error) throw new Error(prior.error.message)
  if(prior.data) return {batchId:prior.data.id,reused:true}
  const latest=await db.from('recommendation_batches').select('id').eq('owner_id',ownerId).lte('published_at',context.cutoff).order('published_at',{ascending:false}).limit(1).maybeSingle()
  if(latest.error) throw new Error(latest.error.message)
  const priorBatchId=latest.data?.id
  const retained=await renewFrozenRecommendations(context,priorBatchId)
  const names=context.names.filter(n=>!retained.some(r=>assessmentKey(r)===assessmentKey(n)))
  const batches=partitionAssessmentNames(names)
  if(batches.length>100) throw new Error('Recommendation edition exceeds the supported durable assessment dependency budget')
  const dependencyJobIds:string[]=[]
  for(const batch of batches) {
    const assessmentKeys=batch.map(assessmentKey)
    const job=await enqueue('generate-daily-recommendations',{ownerId,phase:'assess',manifestId:context.id,assessmentKeys,assessmentVersion:RECOMMENDATION_ASSESSMENT_VERSION},
      `recommendation-assessment:${ownerId}:${context.id}:${RECOMMENDATION_ASSESSMENT_VERSION}:${contentHash(assessmentKeys).slice(0,24)}`)
    dependencyJobIds.push(job.id)
  }
  const next=await enqueue('generate-daily-recommendations',{ownerId,phase:'finalize',manifestId:context.id,dependencyJobIds,
    assessmentVersion:RECOMMENDATION_ASSESSMENT_VERSION,...(priorBatchId?{priorBatchId}:{})},
    `recommendation-finalize:${ownerId}:${context.id}:${RECOMMENDATION_ASSESSMENT_VERSION}:${contentHash({dependencyJobIds,priorBatchId:priorBatchId??null}).slice(0,24)}`)
  return {preparing:true,manifestId:context.id,assessmentCount:batches.length,dependencyJobIds,continuationJobId:next.id}
}

export async function runRecommendationAssessment(ownerId: string, manifestId: string, keys: unknown): Promise<FrozenAssessment> {
  const context=await loadFrozenContext(ownerId,manifestId)
  const names=selectAssessmentNames(context,keys)
  const result=await assessFrozenRecommendations(context,names)
  return {kind:RECOMMENDATION_ASSESSMENT_VERSION,manifestId,frozenHash:contentHash(context),keys:names.map(assessmentKey),...result,metadata:record(result.metadata)}
}

export async function finalizeRecommendationEdition(ownerId: string, manifestId: string, dependencyJobIds: string[], priorBatchId?: string) {
  if(new Set(dependencyJobIds).size!==dependencyJobIds.length) throw new Error('Duplicate assessment dependencies')
  const db=investmentDb(),context=await loadFrozenContext(ownerId,manifestId)
  const prior=await db.from('recommendation_batches').select('id').eq('manifest_id',context.id).maybeSingle()
  if(prior.error) throw new Error(prior.error.message)
  if(prior.data) return {batchId:prior.data.id,reused:true}
  const retained=await renewFrozenRecommendations(context,priorBatchId)
  const results:FrozenAssessment[]=[],receipts:Array<{jobId:string;runId:string;output:FrozenAssessment}>=[]
  for(const jobId of dependencyJobIds) {
    const job=await db.from('agent_jobs').select('status,payload,job_type').eq('id',jobId).single()
    if(job.error) throw new Error(`Missing recommendation assessment prerequisite: ${jobId}`)
    const payload=record(job.data.payload)
    if(job.data.status!=='succeeded') throw new Error(`Recommendation assessment prerequisite ${jobId} is ${job.data.status}; no replacement edition was published`)
    if(job.data.job_type!=='generate-daily-recommendations'||payload.phase!=='assess'||payload.ownerId!==ownerId||payload.manifestId!==manifestId||payload.assessmentVersion!==RECOMMENDATION_ASSESSMENT_VERSION) throw new Error('Assessment prerequisite belongs to another owner, manifest or contract')
    const run=await db.from('agent_runs').select('id,output').eq('job_id',jobId).eq('status','succeeded').order('finished_at',{ascending:false}).limit(1).single()
    if(run.error) throw new Error(`Missing durable reviewed assessment result: ${jobId}`)
    const output=run.data.output as unknown as FrozenAssessment
    if(!output||JSON.stringify(output.keys)!==JSON.stringify(payload.assessmentKeys)) throw new Error('Assessment output does not match its durable job scope')
    results.push(output)
    receipts.push({jobId,runId:run.data.id,output})
  }
  const recommendations=combineFrozenAssessments(context,contentHash(context),retained,results)
  const stage=(name:'generator'|'critic')=>{
    const stages=results.map(r=>record(r.metadata[name])).filter(r=>r.status==='succeeded')
    const models=[...new Set(stages.map(r=>String(r.model)))]
    return stages.length?{provider:stages[0].provider,model:models.length===1?models[0]:'mixed',models,status:'succeeded',durationMs:stages.reduce((sum,r)=>sum+Number(r.durationMs??0),0),assessmentCount:stages.length}
      :{provider:'deterministic',status:'not_required',assessmentCount:0}
  }
  return publishFrozenRecommendations(context,{recommendations,
    summary:`Evaluated ${context.names.length} account/security pairs using one frozen manifest; retained ${retained.length} unchanged conclusions and completed ${results.length} bounded assessments. These decisions are advice for owner review.`,
    metadata:{assessmentVersion:RECOMMENDATION_ASSESSMENT_VERSION,forecastReviewPolicy:FORECAST_REVIEW_POLICY,
      withheldForecasts:results.flatMap(r=>Array.isArray(r.metadata.withheldForecasts)?r.metadata.withheldForecasts:[]),
      reusedConclusions:retained.length,renewedFromBatchId:priorBatchId??null,analyzedNames:context.names.length-retained.length,
      generator:stage('generator'),critic:stage('critic'),
      criticBlocks:results.flatMap(r=>Array.isArray(r.metadata.criticBlocks)?r.metadata.criticBlocks:[]),
      contractFailures:results.flatMap(r=>Array.isArray(r.metadata.contractFailures)?r.metadata.contractFailures:[]),
      assessments:receipts.map(({jobId,runId,output})=>({jobId,runId,keys:output.keys,metadata:output.metadata})),
      frozenHash:contentHash(context)},
  })
}
