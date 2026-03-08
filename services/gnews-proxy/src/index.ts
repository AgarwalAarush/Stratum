interface Env {
  PROXY_API_KEY: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return Response.json({ ok: true })
    }

    if (request.headers.get('x-proxy-key') !== env.PROXY_API_KEY) {
      return Response.json({ error: 'unauthorized' }, { status: 401 })
    }

    const headers = new Headers()
    for (const key of ['accept', 'accept-language', 'accept-encoding', 'user-agent']) {
      const value = request.headers.get(key)
      if (value) headers.set(key, value)
    }

    try {
      const upstream = await fetch(
        `https://news.google.com${url.pathname}${url.search}`,
        { method: request.method, headers, redirect: 'follow' },
      )
      return new Response(upstream.body, {
        status: upstream.status,
        headers: upstream.headers,
      })
    } catch {
      return Response.json({ error: 'upstream failed' }, { status: 502 })
    }
  },
}
