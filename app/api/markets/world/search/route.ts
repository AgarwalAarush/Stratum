import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { retrieveWorldMemory } from '@/lib/server/world-retrieval'
import { validateMemoryQuery } from '@/lib/markets/world-retrieval'
export const dynamic='force-dynamic'
export const CACHE_TTL_SECONDS=0
export async function GET(request:Request){
 const user=await getAllowedMarketUser()
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
 const p=new URL(request.url).searchParams
 let input
 try{input=validateMemoryQuery({query:p.get('q')??'',symbol:p.get('symbol')?.toUpperCase(),knowledgeCutoff:p.get('knowledgeCutoff')??undefined,eventFrom:p.get('eventFrom')??undefined,eventTo:p.get('eventTo')??undefined,limit:p.has('limit')?Number(p.get('limit')):undefined})}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Invalid search'},{status:400})}
 try{return NextResponse.json(await retrieveWorldMemory(input,{ownerId:user.id}),{headers:{'Cache-Control':'private, no-store'}})}
 catch{return NextResponse.json({error:'Memory search is unavailable'},{status:503})}
}
