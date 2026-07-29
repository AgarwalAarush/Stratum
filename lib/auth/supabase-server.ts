import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isAllowedMarketUser, marketsAuthBypassEnabled } from './markets-auth'

function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return { url, key }
}

export async function createSupabaseServerClient() {
  const config = authConfig()
  if (!config) return null
  const cookieStore = await cookies()

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Components cannot always write cookies. proxy.ts refreshes them.
        }
      },
    },
  })
}

export async function getAllowedMarketUser() {
  if (marketsAuthBypassEnabled()) {
    return { id: 'local-development-user', email: 'local@stratum.invalid' }
  }
  const supabase = await createSupabaseServerClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  return isAllowedMarketUser(user) ? user : null
}

export async function requireAllowedMarketUser() {
  const user = await getAllowedMarketUser()
  if (!user) redirect('/markets-sign-in')
  return user
}
