'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { reviewRecommendationTrade } from '@/lib/server/recommendation-trade'
import styles from './RecommendationMemo.module.css'
type Preview=Awaited<ReturnType<typeof reviewRecommendationTrade>>
export function RecommendationReview({recommendationId,symbol,events,disabled,onSaved}:{recommendationId:string;symbol:string;events:Record<string,unknown>[];disabled:boolean;onSaved:()=>void}) {
  const router=useRouter()
  const latest=events.find(e=>['accepted','delayed','rejected'].includes(String(e.event_type)))
  const [choice,setChoice]=useState(String(latest?.event_type??''))
  const [saved,setSaved]=useState(String(latest?.event_type??''))
  const [note,setNote]=useState(''),[instruction,setInstruction]=useState(''),[time,setTime]=useState('')
  const [preview,setPreview]=useState<Preview|null>(null),[pending,setPending]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('')
  async function post(url:string,body:unknown) {
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    const data=await response.json(); if(!response.ok) throw new Error(data.error??'Unable to save'); return data
  }
  async function decide() {
    setPending('decision');setError('');setMessage('')
    try {await post('/api/markets/recommendations',{recommendationId,eventType:choice,rationale:note.trim()||({accepted:'Accepted after reviewing the recommendation.',delayed:'Waiting before acting on this recommendation.',rejected:'Rejected after reviewing the recommendation.'} as Record<string,string>)[choice],requestId:crypto.randomUUID()});setSaved(choice);setMessage('Decision saved.');onSaved()}
    catch(e){setError(e instanceof Error?e.message:'Unable to save decision')}finally{setPending('')}
  }
  async function review() {
    setPending('review');setError('');setMessage('')
    try {setPreview(await post('/api/markets/recommendations/trade',{action:'review',recommendationId,instruction,occurredAt:new Date(time).toISOString()}))}
    catch(e){setError(e instanceof Error?e.message:'Unable to review trade')}finally{setPending('')}
  }
  async function confirm() {
    setPending('confirm');setError('')
    try {const result=await post('/api/markets/recommendations/trade',{action:'confirm',token:preview!.token});setPreview(null);setInstruction('');setMessage(result.brokerage?'Trade saved to your ledger. Broker holdings will reconcile on the next sync.':'Trade saved. Your portfolio has been updated.');onSaved();router.refresh()}
    catch(e){setError(e instanceof Error?e.message:'Unable to save trade')}finally{setPending('')}
  }
  const money=(v:number)=>v.toLocaleString('en-US',{style:'currency',currency:'USD'})
  return <aside className={styles.review} aria-label={`Review ${symbol} recommendation`}>
    <h3>Your decision</h3><p>Review the case, then choose how to proceed.</p>
    <div className={styles.choices}>{[['accepted','Accept'],['delayed','Wait'],['rejected','Reject']].map(([value,label])=><button type="button" key={value} aria-pressed={choice===value} disabled={!!pending||(disabled&&value==='accepted')} onClick={()=>setChoice(value)}>{label}</button>)}</div>
    {disabled&&<p>Request a fresh assessment before accepting this advice.</p>}
    <label>A note on your decision <span>(optional)</span><textarea value={note} maxLength={2000} onChange={e=>setNote(e.target.value)} placeholder="What matters to you in this decision?" /></label>
    <button className={styles.primary} disabled={!choice||!!pending||(disabled&&choice==='accepted')} onClick={decide}>{pending==='decision'?'Saving…':'Save decision'}</button>
    {saved==='accepted'&&<section className={styles.trade}><h3>What did you actually do?</h3><p>Acceptance saves your intent. Record the actual fill when you have it.</p>
      <label>Completed trade<textarea value={instruction} maxLength={2000} onChange={e=>{setInstruction(e.target.value);setPreview(null)}} placeholder={`Sold 0.5 shares of ${symbol} at $400 with $0 fees`} /></label>
      <label>Actual fill time <span>(your local time)</span><input type="datetime-local" value={time} onChange={e=>{setTime(e.target.value);setPreview(null)}} /></label>
      <button className={styles.secondary} disabled={!!pending||!instruction.trim()||!time} onClick={review}>{pending==='review'?'Reviewing your report…':'Review portfolio update'}</button>
      {preview&&<div className={styles.preview}><h4>Confirm the recorded trade</h4><p>{preview.portfolioName} · {preview.trade.action==='sell'?'Sold':'Bought'} {preview.trade.quantity} {preview.trade.symbol} at {money(preview.trade.pricePerShare)}</p>
        <dl><div><dt>Fees</dt><dd>{money(preview.trade.fees)}</dd></div><div><dt>Fill time</dt><dd>{new Date(preview.occurredAt).toLocaleString()}</dd></div><div><dt>Shares</dt><dd>{preview.heldShares} → {preview.resultingShares}</dd></div><div><dt>Cash effect</dt><dd>{money(preview.cashChange)}</dd></div></dl>
        <p>{preview.brokerage?'This updates the transaction ledger. Robinhood remains authoritative for broker holdings.':'This updates your portfolio shares and cash.'}</p><p className={styles.small}>{preview.reviewer} · No order is placed.</p>
        <button className={styles.primary} disabled={!!pending} onClick={confirm}>{pending==='confirm'?'Saving trade…':'Confirm portfolio update'}</button><button className={styles.textButton} disabled={!!pending} onClick={()=>setPreview(null)}>Edit report</button>
      </div>}
    </section>}
    {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
    {events.length>0&&<details className={styles.history}><summary>Decision history ({events.length})</summary>{events.map(e=><p key={String(e.id)}><strong>{({accepted:'Accepted',delayed:'Waiting',rejected:'Rejected',manually_executed:'Trade recorded'} as Record<string,string>)[String(e.event_type)]??'Reviewed'}</strong> · {new Date(String(e.recorded_at)).toLocaleDateString()}<br/>{String(e.rationale)}</p>)}</details>}
  </aside>
}
