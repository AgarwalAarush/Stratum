import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import schema from '../../schemas/portfolio-trade-review.schema.json' with {type:'json'}
import { generateOpenAIJson } from './openai-responses.ts'
import { tradeExtractionPrompt, type TradeExtraction } from './trade-extraction.ts'
import { AI_MODELS } from '../ai/config.ts'
import { getSupabaseClient } from './supabase.ts'
import { parsePortfolioUpdate, validatePortfolioUpdate, type ParsedPortfolioUpdate } from '../markets/portfolio-updates.ts'
import { fetchAuthoritativePortfolios } from './portfolio.ts'

type Trade = ParsedPortfolioUpdate & {action:'buy'|'sell'; symbol:string; quantity:number; pricePerShare:number; previousQuantity?:number; previousCash?:number}
type Review = {ownerId:string; recommendationId:string; portfolioId:string; requestId:string; expiresAt:number; occurredAt:string; trade:Trade; kind:string}
function db() { const client=getSupabaseClient(); if(!client) throw new Error('Portfolio review is unavailable'); return client }
function secret() { const key=process.env.MARKETS_SESSION_SECRET; if(!key) throw new Error('Portfolio review signing is unavailable'); return key }
function sign(payload:string) {return createHmac('sha256',secret()).update(`portfolio-review-v1:${payload}`).digest('hex')}
export function readTradeReview(token:string,ownerId:string):Review {
  const [payload,signature]=token.split('.')
  if(!payload||!signature||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(sign(payload),'hex'))) throw new Error('Review has changed. Review the trade again.')
  const review=JSON.parse(Buffer.from(payload,'base64url').toString()) as Review
  if(review.ownerId!==ownerId||review.expiresAt<Date.now()) throw new Error('Review expired. Review the trade again.')
  return review
}
async function recommendation(ownerId:string,id:string) {
  const result=await db().from('recommendation_versions').select('id,symbol,portfolio_id,issued_at').eq('owner_id',ownerId).eq('id',id).single()
  if(result.error) throw new Error('Recommendation is unavailable')
  return result.data
}
export async function reviewRecommendationTrade(ownerId:string,input:Record<string,unknown>,extraction?:TradeExtraction) {
  const instruction=typeof input.instruction==='string'?input.instruction.trim().slice(0,2000):''
  const occurredAt=typeof input.occurredAt==='string'?input.occurredAt:''
  if(instruction.length<8) throw new Error('Describe the completed trade with shares, symbol and fill price.')
  const rec=await recommendation(ownerId,String(input.recommendationId??''))
  if(!Number.isFinite(Date.parse(occurredAt))||Date.parse(occurredAt)>Date.now()+60000||Date.parse(occurredAt)<Date.parse(rec.issued_at)) throw new Error('Choose the actual fill time, after this recommendation was published.')
  let parsed=extraction?null:parsePortfolioUpdate(instruction)
  let reviewer='Structured parser'
  if(!parsed) {
    const apiKey=process.env.OPENAI_API_KEY
    if(!apiKey&&!extraction) {
      const {enqueueAgentJob}=await import('./agent-jobs.ts')
      const job=await enqueueAgentJob('review-recommendation-trade',{ownerId,recommendationId:rec.id,instruction,occurredAt},`review-trade:${ownerId}:${randomUUID()}`)
      return {queued:true as const,jobId:job.id}
    }
    const generated=extraction?{data:extraction}:await generateOpenAIJson({apiKey:apiKey!,model:AI_MODELS.portfolioTradeReview,input:tradeExtractionPrompt(instruction),schemaName:'portfolio_trade_review',schema:schema,maxOutputTokens:700,validate:(v)=>v as TradeExtraction})
    const value=generated.data
    if(!Array.isArray(value.missing)||value.missing.length) throw new Error(`Please clarify: ${value.missing?.join(', ')||'actual trade details'}.`)
    parsed={action:value.side!,symbol:value.symbol?.toUpperCase()??null,quantity:value.quantity,pricePerShare:value.price,fees:value.fees??0,occurredAt:'',notes:instruction}
    reviewer=extraction?'Codex worker review':'OpenAI structured review'
  }
  const date=new Date(occurredAt).toLocaleDateString('en-CA',{timeZone:'America/New_York'})
  parsed={...parsed,occurredAt:date,notes:instruction}
  const error=validatePortfolioUpdate(parsed)
  if(error) throw new Error(error)
  if(!['buy','sell'].includes(parsed.action)||parsed.symbol!==rec.symbol) throw new Error(`Describe one completed trade for ${rec.symbol}. Use Portfolio for other transactions.`)
  const portfolios=await fetchAuthoritativePortfolios(ownerId)
  const portfolio=portfolios.find(p=>p.account.id===rec.portfolio_id)
  if(!portfolio) throw new Error('Portfolio could not be verified')
  const trade=parsed as Trade
  const held=portfolio.holdings.find(h=>h.symbol===trade.symbol)?.quantity??0
  if(portfolio.dataSource!=='robinhood'&&trade.action==='sell'&&trade.quantity>held+1e-8) throw new Error(`The report exceeds the recorded holding (${held} shares). Reconcile Portfolio first.`)
  trade.previousQuantity=held;trade.previousCash=portfolio.cashBalance
  if(portfolio.account.kind==='manual') {
    const confirmation=await db().from('portfolio_confirmations').select('confirmed_at').eq('owner_id',ownerId).eq('portfolio_id',rec.portfolio_id).order('confirmed_at',{ascending:false}).limit(1).maybeSingle()
    if(confirmation.error) throw new Error('Portfolio confirmation could not be checked')
    if(confirmation.data) { const changes=await db().from('portfolio_transactions').select('id').eq('owner_id',ownerId).eq('portfolio_id',rec.portfolio_id).gt('created_at',confirmation.data.confirmed_at).limit(1); if(changes.error||changes.data?.length) throw new Error('The manual snapshot has unreconciled transactions. Update Portfolio inputs first.') }
  }
  const dated=instruction.match(/(?:on|dated)\s+(\d{4}-\d{2}-\d{2})/i)
  if(dated&&dated[1]!==date) throw new Error('The report date and selected fill time disagree. Correct them before reviewing.')
  const gross=trade.quantity*trade.pricePerShare
  const cashChange=trade.action==='sell'?gross-trade.fees:-gross-trade.fees
  if(portfolio.account.kind==='manual'&&portfolio.cashBalance+cashChange < -0.01) throw new Error('The purchase exceeds recorded portfolio cash. Reconcile Portfolio first.')
  const review:Review={ownerId,recommendationId:rec.id,portfolioId:rec.portfolio_id,requestId:randomUUID(),expiresAt:Date.now()+15*60000,occurredAt,trade,kind:portfolio.account.kind}
  const payload=Buffer.from(JSON.stringify(review)).toString('base64url')
  return {token:`${payload}.${sign(payload)}`,trade,occurredAt,reviewer,portfolioName:portfolio.account.name,heldShares:held,resultingShares:portfolio.account.kind==='brokerage'?null:held+(trade.action==='buy'?trade.quantity:-trade.quantity),cashChange,brokerage:portfolio.account.kind==='brokerage'}
}
export async function confirmRecommendationTrade(ownerId:string,token:string) {
  const review=readTradeReview(token,ownerId)
  const result=await db().rpc('record_reviewed_recommendation_trade',{p_owner_id:ownerId,p_recommendation_id:review.recommendationId,p_request_id:review.requestId,p_trade:review.trade,p_occurred_at:review.occurredAt})
  if(result.error) throw new Error('Unable to save the reviewed trade. Try again; the same review cannot create a duplicate.')
  return {saved:true,transactionId:result.data,brokerage:review.kind==='brokerage'}
}

export async function readRecommendationTradeJob(ownerId:string,jobId:string) {
 const result=await db().from('agent_jobs').select('id,status,payload,last_error').eq('id',jobId).eq('job_type','review-recommendation-trade').eq('payload->>ownerId',ownerId).single()
 if(result.error) throw new Error('Trade review is unavailable')
 const job=result.data
 if(['failed','blocked','cancelled'].includes(job.status)) throw new Error('The trade review could not finish. Try again with actual quantity, symbol and fill price.')
 if(job.status!=='succeeded') {
  const activity=job.status==='running'?await db().from('agent_runs').select('output').eq('job_id',jobId).eq('status','running').order('started_at',{ascending:false}).limit(1).maybeSingle():null
  const output=activity?.data?.output as {phase?:string;progress?:number}|undefined
  return {queued:true as const,jobId,status:job.status,phase:output?.phase||'Waiting for the private review worker',progress:output?.progress}
 }
 const run=await db().from('agent_runs').select('output').eq('job_id',jobId).eq('status','succeeded').order('finished_at',{ascending:false}).limit(1).single()
 if(run.error) throw new Error('Completed review details are unavailable')
 const output=run.data.output as {data:TradeExtraction}
 return reviewRecommendationTrade(ownerId,job.payload,output.data)
}
