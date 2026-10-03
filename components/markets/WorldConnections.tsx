import Link from 'next/link'
import type { CompanyWorldReceipt } from '@/lib/server/company-world-memory'
const labels:Record<string,string>={pending:'Pending review',reviewing:'Review in progress',applied:'World updated',no_change:'Reviewed · no material change',blocked:'Evidence gap or critic rejection',failed:'Review failed'}
export function WorldConnections({receipts,reciprocal=false}:{receipts:CompanyWorldReceipt[];reciprocal?:boolean}){
 return <section className="world-memory-connections" aria-label={reciprocal?'Connected company research':'World connections'}>
  <p className="markets-eyebrow">Research memory</p><h2>{reciprocal?'Connected company research':'World connections'}</h2>
  <p>Company evidence can strengthen or challenge World’s shadow knowledge.</p>
  {!receipts.length?<p>No World review is recorded for this version.</p>:<ul>{receipts.map(r=><li key={r.report_id}>
   <strong>{reciprocal?<Link href={`/markets/stocks/${encodeURIComponent(r.symbol)}/research?report=${r.report_id}`}>{r.symbol} research</Link>:r.symbol}</strong>
   <span>{labels[r.status]??r.status}</span>
   {r.explanation?<p>{r.explanation}</p>:null}
   {r.evidence_gaps.length?<details><summary>{r.evidence_gaps.length} evidence gaps</summary><ul>{r.evidence_gaps.map(g=><li key={g}>{g}</li>)}</ul></details>:null}
   <nav aria-label={`${r.symbol} World connections`}>{r.affected_node_ids.map(id=><Link key={id} href={`/markets/world/${encodeURIComponent(id)}`}>{id.replaceAll('-',' ')}</Link>)}</nav>
   {r.context_node_ids?.length?<><p>Related World context</p><nav aria-label={`${r.symbol} World context`}>{r.context_node_ids.filter(id=>!r.affected_node_ids.includes(id)).map(id=><Link key={id} href={`/markets/world/${encodeURIComponent(id)}`}>{id.replaceAll('-',' ')}</Link>)}</nav></>:null}
   {r.result_commit?<small>Accepted World commit {r.result_commit.slice(0,10)}</small>:null}
  </li>)}</ul>}
 </section>
}
