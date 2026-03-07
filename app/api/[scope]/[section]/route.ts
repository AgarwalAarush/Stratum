// app/api/[scope]/[section]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getMockSection } from '../../../lib/mock-data.ts'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scope: string; section: string }> }
) {
  const { scope, section } = await params
  const apiPath = `/api/${scope}/${section}`
  const data = getMockSection(apiPath)

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
    },
  })
}
