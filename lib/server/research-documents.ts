import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { parseHTML } from 'linkedom'
import { extractedText } from './world-source-collector.ts'
import type { ResearchDocument } from '../markets/research-coverage.ts'

function privateAddress(ip: string): boolean {
  return /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::|f[cd]|fe[89ab])/i.test(ip) || ip.includes(':') && !/^2[0-9a-f]{3}:/i.test(ip)
}
export function validateResearchDocumentUrl(value: string): URL {
  const url = new URL(value)
  const hasCredentials = Boolean(url.username) || Boolean(url.password)
  if (hasCredentials) throw new Error('Research document URL must not contain credentials')
  if (url.protocol !== 'https:' || url.port && url.port !== '443' || /(?:^localhost$|\.local$)/i.test(url.hostname) || isIP(url.hostname.replace(/^\[|\]$/g,''))) throw new Error('Research document requires a public HTTPS URL')
  return url
}
export async function captureResearchDocument(input: {url: string; sourceId: string; publishedAt: string | null; companyWebsite?: string | null; timeoutMs?: number}, fetchImpl = fetch): Promise<ResearchDocument & {links: Array<{url:string;label:string}>}> {
  const result: ResearchDocument & {links: Array<{url:string;label:string}>} = {sourceId:input.sourceId,url:input.url,publishedAt:input.publishedAt,capturedAt:new Date().toISOString(),extractionStatus:'failed',contentHash:null,text:null,error:null,quality:'independent',links:[]}
  try {
    let current = validateResearchDocumentUrl(input.url)
    const signal = AbortSignal.timeout(Math.max(1, Math.min(20_000, input.timeoutMs ?? 20_000)))
    for (let redirects = 0; redirects <= 4; redirects++) {
      validateResearchDocumentUrl(current.toString())
      if (fetchImpl === fetch) {
        const addresses = await lookup(current.hostname,{all:true})
        if (!addresses.length || addresses.some(a => privateAddress(a.address))) throw new Error('Research document resolves to a private address')
      }
      const response = await fetchImpl(current,{redirect:'manual',signal,headers:{'User-Agent':process.env.SEC_API_USER_AGENT || 'Stratum private research (aarushagarwal.dev)',Accept:'text/html,application/pdf'}})
      if (response.status >= 300 && response.status < 400) {const location=response.headers.get('location');if(!location)throw new Error('Redirect lacks location');current=new URL(location,current);continue}
      if (!response.ok) throw new Error(`Document HTTP ${response.status}`)
      const type=response.headers.get('content-type')?.split(';')[0] ?? ''
      if (!/html|pdf/i.test(type)) throw new Error('Unsupported document format')
      const chunks:Uint8Array[]=[];let bytes=0
      if(!response.body)throw new Error('Empty document')
      const reader=response.body.getReader()
      try {while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>25*1024*1024){await reader.cancel();throw new Error('Document exceeds capture limit')}chunks.push(part.value)}} finally {reader.releaseLock()}
      const body=Buffer.concat(chunks)
      // EDGAR may wrap its HTML document in SGML. Normalize fragments too.
      const raw=body.toString('utf8'), start=raw.search(/<!doctype html|<html/i), end=raw.toLowerCase().lastIndexOf('</html>')
      const html=start>=0 ? raw.slice(start,end>=start ? end+7 : undefined) : `<html><body>${raw}</body></html>`
      const extracted=await extractedText(type.includes('html') ? Buffer.from(html) : body,type)
      result.url=current.toString();result.contentHash=createHash('sha256').update(body).digest('hex')
      if (!extracted.complete || extracted.text.length < 100) throw new Error('Document text extraction failed or empty')
      // Preserve the captured text; synthesis can select passages without losing topics at the end.
      result.text=extracted.text;result.extractionStatus='readable'
      const companyHost=input.companyWebsite ? new URL(input.companyWebsite).hostname.replace(/^www\./,'') : null
      result.quality=current.hostname==='sec.gov'||current.hostname.endsWith('.sec.gov')?'regulatory':companyHost&&(current.hostname===companyHost||current.hostname.endsWith(`.${companyHost}`))?'primary':'independent'
      if(type.includes('html')){const {document}=parseHTML(html);result.links=Array.from(document.querySelectorAll('a[href]')).flatMap(a=>{try{return [{url:new URL(a.getAttribute('href')!,current).toString(),label:a.textContent?.trim()??''}]}catch{return []}})}
      return result
    }
    throw new Error('Too many document redirects')
  } catch(error) {result.error=error instanceof Error?error.message:'Document capture failed';return result}
}

export async function collectSecFilingDocuments<T extends {url:string;form?:string;title:string;publishedAt:string;excerpt?:string|null}>(filings:T[], capture=captureResearchDocument):Promise<{filings:T[];documents:ResearchDocument[]}> {
  const documents:ResearchDocument[]=[]
  const selected=new Set<number>()
  for(const form of ['10-K','10-Q','424B4','S-1','S-1/A','8-K']){const i=filings.findIndex(f=>f.form===form);if(i>=0)selected.add(i)}
  // Inspect recent 8-K bodies to locate results, rather than assuming newest means earnings.
  const eightKs=filings.map((f,i)=>({f,i})).filter(({f})=>f.form==='8-K').slice(0,8)
  let earningsFound=false
  for(const {f,i} of eightKs){
    const doc=await capture({url:f.url,sourceId:`sec-filing-${i+1}`,publishedAt:f.publishedAt})
    if(selected.has(i))documents.push(doc)
    if(doc.text && /Item\s*2\.02|Results of Operations and Financial Condition/i.test(doc.text)){
      if(!selected.has(i))documents.push(doc);selected.add(i);earningsFound=true
      const exhibits=doc.links.filter(l=>/99[.\-_]?\d|ex(?:hibit)?99/i.test(l.label+' '+l.url)).slice(0,3)
      for(const [n,link]of exhibits.entries()){const attachment=await capture({url:link.url,sourceId:`sec-filing-${i+1}-exhibit-${n+1}`,publishedAt:f.publishedAt});documents.push(attachment)}
      break
    }
  }
  if(!earningsFound)documents.push({sourceId:'sec-earnings-update',url:filings[0]?.url??'https://www.sec.gov',publishedAt:null,capturedAt:new Date().toISOString(),extractionStatus:'failed',contentHash:null,text:null,error:'Latest earnings 8-K could not be identified in recent filings',quality:'regulatory'})
  for(const i of selected){if(documents.some(d=>d.sourceId===`sec-filing-${i+1}`))continue;documents.push(await capture({url:filings[i]!.url,sourceId:`sec-filing-${i+1}`,publishedAt:filings[i]!.publishedAt}))}
  return {filings:filings.map((f,i)=>({...f,excerpt:documents.find(d=>d.sourceId===`sec-filing-${i+1}`)?.text??null})),documents}
}
