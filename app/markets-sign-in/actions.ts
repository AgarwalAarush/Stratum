'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { marketEmailAllowlist } from '@/lib/auth/markets-auth'
import { createSupabaseServerClient } from '@/lib/auth/supabase-server'

export async function sendMarketsMagicLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email || !marketEmailAllowlist().has(email)) {
    redirect('/markets-sign-in?sent=1')
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/markets-sign-in?error=configuration')
  const headerStore = await headers()
  const origin = headerStore.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/markets`,
      shouldCreateUser: true,
    },
  })
  if (error) redirect('/markets-sign-in?error=send')
  redirect('/markets-sign-in?sent=1')
}
