// app/api/ai-research/papers/route.ts
import { NextResponse } from 'next/server'
import { fetchArxivPapers } from '@/lib/data/arxiv'

export const revalidate = 3600

export async function GET() {
  const items = await fetchArxivPapers(15)
  return NextResponse.json(
    { items, fetchedAt: new Date().toISOString() },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
      },
    }
  )
}
