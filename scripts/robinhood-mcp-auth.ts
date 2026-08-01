import { createServer, type Server } from 'node:http'

import { auth, Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

import {
  DEFAULT_ROBINHOOD_MCP_URL,
  DEFAULT_ROBINHOOD_OAUTH_REDIRECT_PORT,
  FileRobinhoodOAuthProvider,
  getRobinhoodOAuthStorePath,
} from '../lib/server/robinhood-mcp-oauth.ts'

const mcpUrl = process.env.ROBINHOOD_MCP_URL?.trim() || DEFAULT_ROBINHOOD_MCP_URL
const port = Number(process.env.ROBINHOOD_MCP_OAUTH_PORT ?? DEFAULT_ROBINHOOD_OAUTH_REDIRECT_PORT)
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('ROBINHOOD_MCP_OAUTH_PORT must be a loopback TCP port between 1024 and 65535')
}

const redirectUrl = `http://127.0.0.1:${port}/callback`
const storePath = getRobinhoodOAuthStorePath()
let receiveAuthorizationUrl: ((url: URL) => void) | undefined
const authorizationUrl = new Promise<URL>((resolve) => { receiveAuthorizationUrl = resolve })
const provider = new FileRobinhoodOAuthProvider({
  storePath,
  redirectUrl,
  onAuthorizationUrl: (url) => receiveAuthorizationUrl?.(url),
})

interface Callback {
  code: string
  iss?: string
}

let callbackServer: Server | undefined
const callback = new Promise<Callback>((resolve, reject) => {
  callbackServer = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', redirectUrl)
    if (request.method !== 'GET' || url.pathname !== '/callback') {
      response.writeHead(404).end()
      return
    }
    if (!(await provider.hasExpectedState(url.searchParams.get('state')))) {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Authorization could not be verified. Return to the terminal and try again.')
      return
    }
    const code = url.searchParams.get('code')
    if (!code || url.searchParams.has('error')) {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Robinhood authorization was not completed. Return to the terminal and try again.')
      reject(new Error('Robinhood OAuth was cancelled or did not return an authorization code'))
      callbackServer?.close()
      return
    }
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Robinhood authorization is complete. You may close this tab.')
    resolve({ code, iss: url.searchParams.get('iss') ?? undefined })
    callbackServer?.close()
  })
  callbackServer.on('error', reject)
  callbackServer.listen(port, '127.0.0.1')
})

const timeout = new Promise<never>((_, reject) => setTimeout(
  () => reject(new Error('Robinhood authorization timed out after 15 minutes')),
  15 * 60 * 1000,
))

async function verifyConnection(): Promise<number> {
  const client = new Client({ name: 'stratum-private-portfolio-auth', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    authProvider: provider,
    requestInit: { signal: AbortSignal.timeout(30_000) },
  })
  try {
    await client.connect(transport)
    return (await client.listTools()).tools.length
  } finally {
    await client.close().catch(() => undefined)
  }
}

const authResult = await auth(provider, { serverUrl: mcpUrl })
if (authResult === 'REDIRECT') {
  const url = await authorizationUrl
  console.info('Open this one-time Robinhood authorization URL in your local browser:')
  console.info(url.toString())
  console.info(`Keep this command running. If it is on macserver, tunnel the callback first: ssh -N -L ${port}:127.0.0.1:${port} macserver`)
  const result = await Promise.race([callback, timeout])
  await auth(provider, { serverUrl: mcpUrl, authorizationCode: result.code, iss: result.iss })
} else {
  callbackServer?.close()
}

const toolCount = await verifyConnection()
console.info(`Robinhood MCP authorization verified (${toolCount} tools). The worker can now use its private OAuth store.`)
