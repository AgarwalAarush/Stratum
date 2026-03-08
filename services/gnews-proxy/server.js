const http = require('http')
const https = require('https')

const PORT = process.env.PORT || 3001
const API_KEY = process.env.PROXY_API_KEY

if (!API_KEY) {
  console.error('PROXY_API_KEY is required')
  process.exit(1)
}

const server = http.createServer((req, res) => {
  // Health check — no auth
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"ok":true}')
    return
  }

  // Auth check
  if (req.headers['x-proxy-key'] !== API_KEY) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end('{"error":"unauthorized"}')
    return
  }

  // Forward to news.google.com
  const headers = { ...req.headers }
  delete headers['host']
  delete headers['x-proxy-key']
  delete headers['connection']

  const upstream = https.request(
    `https://news.google.com${req.url}`,
    { method: req.method, headers, timeout: 15_000 },
    (upstreamRes) => {
      console.log(`${req.method} ${req.url} -> ${upstreamRes.statusCode}`)
      res.writeHead(upstreamRes.statusCode, upstreamRes.headers)
      upstreamRes.pipe(res)
    },
  )

  upstream.on('timeout', () => {
    upstream.destroy()
    res.writeHead(504, { 'Content-Type': 'application/json' })
    res.end('{"error":"gateway timeout"}')
  })

  upstream.on('error', (err) => {
    console.error(`Upstream error: ${err.message}`)
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end('{"error":"upstream failed"}')
    }
  })

  req.on('close', () => upstream.destroy())
  req.pipe(upstream)
})

server.listen(PORT, () => {
  console.log(`gnews-proxy listening on port ${PORT}`)
})
