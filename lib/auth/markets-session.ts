import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import {
  MARKETS_OWNER_ID,
  MARKETS_SESSION_COOKIE,
  marketsAuthBypassEnabled,
  verifyMarketsSessionToken,
} from './markets-auth'

export interface MarketsUser {
  id: string
}

export const getAllowedMarketUser = cache(async (): Promise<MarketsUser | null> => {
  if (marketsAuthBypassEnabled()) return { id: 'local-development-user' }
  const cookieStore = await cookies()
  const valid = await verifyMarketsSessionToken(cookieStore.get(MARKETS_SESSION_COOKIE)?.value)
  return valid ? { id: MARKETS_OWNER_ID } : null
})

export async function requireAllowedMarketUser(): Promise<MarketsUser> {
  const user = await getAllowedMarketUser()
  if (!user) redirect('/markets-sign-in')
  return user
}
