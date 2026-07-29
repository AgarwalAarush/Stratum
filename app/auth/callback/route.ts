import { NextResponse, type NextRequest } from 'next/server'
import { isAllowedMarketUser } from '@/lib/auth/markets-auth'
import { createSupabaseServerClient } from '@/lib/auth/supabase-server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const next = request.nextUrl.searchParams.get('next') ?? '/markets'
  const supabase = await createSupabaseServerClient()

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (isAllowedMarketUser(user)) return NextResponse.redirect(new URL(next, request.url))
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/markets-sign-in?error=not-allowed', request.url))
    }
  }

  return NextResponse.redirect(new URL('/markets-sign-in?error=callback', request.url))
}
