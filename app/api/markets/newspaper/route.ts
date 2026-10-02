import { getAuthenticatedMarketUser } from '@/lib/auth/markets-session'
import { serveNewspaperExport } from '@/lib/server/newspaper-export'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  return serveNewspaperExport(request, { authenticate: getAuthenticatedMarketUser })
}
