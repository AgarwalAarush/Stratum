import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  isAllowedMarketUser,
  marketsAuthBypassEnabled,
} from '@/lib/auth/markets-auth'

function isProtectedPath(pathname: string): boolean {
  return pathname === '/markets'
    || pathname.startsWith('/markets/')
    || pathname.startsWith('/api/markets/')
}

export async function proxy(request: NextRequest) {
  if (!isProtectedPath(request.nextUrl.pathname) || marketsAuthBypassEnabled()) {
    return NextResponse.next()
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return Response.json({ error: 'Markets authentication is not configured' }, { status: 503 })
    }
    return NextResponse.redirect(new URL('/markets-sign-in?error=configuration', request.url))
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  const { data: { user } } = await supabase.auth.getUser()

  if (!isAllowedMarketUser(user)) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const signIn = new URL('/markets-sign-in', request.url)
    signIn.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
    if (user) signIn.searchParams.set('error', 'not-allowed')
    return NextResponse.redirect(signIn)
  }

  return response
}

export const config = {
  matcher: ['/markets/:path*', '/api/markets/:path*'],
}
