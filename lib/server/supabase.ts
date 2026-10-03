import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types.ts'

let client: SupabaseClient<Database> | null = null

/** Compatibility entry point while existing workflows migrate table by table. */
export function getSupabaseClient(): SupabaseClient | null {
  return getTypedSupabaseClient()
}

export function getTypedSupabaseClient(): SupabaseClient<Database> | null {
  if (client) return client

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  client = createClient<Database>(url, key, { global: { fetch: (input, init) => {
    const timeout = AbortSignal.timeout(30_000)
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
    return fetch(input, { ...init, signal })
  } } })
  return client
}
