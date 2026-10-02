import { NextResponse } from 'next/server'
import { getAllowedMarketUser } from '@/lib/auth/markets-session'
import { reviewRecommendationTrade, confirmRecommendationTrade } from '@/lib/server/recommendation-trade'
export const dynamic='force-dynamic'
export const maxDuration=60
export async function POST(request:Request) {
  const user=await getAllowedMarketUser()
  if(!user) return NextResponse.json({error:'Unauthorized'},{status:401})
  const origin=request.headers.get('origin')
  if(origin&&origin!==new URL(request.url).origin) return NextResponse.json({error:'Invalid origin'},{status:403})
  try {
    const input=await request.json()
    const result=input.action==='review'?await reviewRecommendationTrade(user.id,input):input.action==='confirm'&&typeof input.token==='string'?await confirmRecommendationTrade(user.id,input.token):null
    if(!result) throw new Error('Choose review or confirm')
    return NextResponse.json(result)
  } catch(error) {return NextResponse.json({error:error instanceof Error?error.message:'Unable to review trade'},{status:400})}
}
