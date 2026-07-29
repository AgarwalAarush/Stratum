import { NextResponse, type NextRequest } from 'next/server'
import {
  MARKETS_SESSION_COOKIE,
  hasMarketsAuthConfig,
  marketsAuthBypassEnabled,
  verifyMarketsSessionToken,
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

  if (!hasMarketsAuthConfig()) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return Response.json({ error: 'Markets authentication is not configured' }, { status: 503 })
    }
    return NextResponse.redirect(new URL('/markets-sign-in?error=configuration', request.url))
  }

  const authenticated = await verifyMarketsSessionToken(
    request.cookies.get(MARKETS_SESSION_COOKIE)?.value,
  )
  if (!authenticated) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const signIn = new URL('/markets-sign-in', request.url)
    signIn.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(signIn)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/markets/:path*', '/api/markets/:path*'],
}
