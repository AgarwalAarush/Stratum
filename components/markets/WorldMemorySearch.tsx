'use client'
import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import type { ClaimBundle } from '@/lib/markets/world-retrieval'
interface SearchResult {bundles:ClaimBundle[];reports:Array<{reportId:string;symbol:string;version:number;href:string}>;abstention:string|null;receipt:{latencyMs:number;contextCharacters:number}}
export function WorldMemorySearch(){
 const [query,setQuery]=useState(''),[result,setResult]=useState<SearchResult|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 async function search(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError('');setResult(null)
  try{const r=await fetch(`/api/markets/world/search?q=${encodeURIComponent(query)}`,{cache:'no-store'});if(!r.ok)throw new Error(r.status===400?'Enter a search of 1–500 characters.':'Memory search is unavailable.');setResult(await r.json())}
  catch(e){setError(e instanceof Error?e.message:'Search failed')}
  finally{setBusy(false)}
 }
 return <section className="world-memory-search" aria-label="Search World memory">
  <form onSubmit={search}><label htmlFor="world-memory-query">Search World and company reports</label><div><input id="world-memory-query" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Companies, constraints, evidence…" maxLength={500} required/><button type="submit" disabled={busy}>{busy?'Searching…':'Search'}</button></div></form>
  <div aria-live="polite">{error?<p role="alert">{error}</p>:null}{result?<>
   {result.abstention?<p>{result.abstention}</p>:null}
   <ul>{result.bundles.map(b=><li key={`${b.nodeId}:${b.claimId}`}><Link href={`/markets/world/${encodeURIComponent(b.nodeId)}`}>{b.nodeTitle}</Link><p>{b.claim.text}</p><small>{b.claim.kind?.replaceAll('_',' ')} · {b.freshness} · {b.evidenceStatus.replaceAll('_',' ')} · known since {new Date(b.acceptedAt).toLocaleDateString('en-US')}</small>{b.counterevidence.length?<details><summary>Counterevidence and corrections ({b.counterevidence.length})</summary>{b.counterevidence.map(c=><p key={c.revisionId}>{c.claim.text}</p>)}</details>:null}</li>)}</ul>
   {result.reports.length?<><h3>Company reports</h3><ul>{result.reports.map(r=><li key={r.reportId}><Link href={r.href}>{r.symbol} · version {r.version}</Link></li>)}</ul></>:null}
   <small>{result.bundles.length} claim bundles · {result.receipt.latencyMs} ms</small>
  </>:null}</div>
 </section>
}
