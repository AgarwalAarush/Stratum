import type { User } from '@supabase/supabase-js'

export function marketEmailAllowlist(environment: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (environment.MARKETS_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isAllowedMarketUser(
  user: Pick<User, 'email'> | null,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!user?.email) return false
  return marketEmailAllowlist(environment).has(user.email.toLowerCase())
}

export function hasMarketsAuthConfig(environment: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    (environment.NEXT_PUBLIC_SUPABASE_URL ?? environment.SUPABASE_URL)
    && environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}

export function marketsAuthBypassEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.NODE_ENV !== 'production' && environment.MARKETS_AUTH_BYPASS === 'true'
}
