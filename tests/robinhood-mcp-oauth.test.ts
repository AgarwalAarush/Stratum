import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FileRobinhoodOAuthProvider } from '../lib/server/robinhood-mcp-oauth.ts'

test('Robinhood OAuth credentials are written only to a private worker-local store', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stratum-robinhood-oauth-'))
  const storePath = join(directory, 'oauth.json')
  try {
    const provider = new FileRobinhoodOAuthProvider({
      storePath,
      redirectUrl: 'http://127.0.0.1:1456/callback',
      onAuthorizationUrl: () => undefined,
    })
    await provider.saveClientInformation({ client_id: 'worker-client', issuer: 'https://broker.example' })
    await provider.saveTokens({ access_token: 'not-logged', refresh_token: 'not-logged', issuer: 'https://broker.example' })
    const state = await provider.state()

    assert.equal(await provider.hasExpectedState(state), true)
    assert.equal(await provider.hasExpectedState('incorrect'), false)
    assert.equal((await provider.tokens())?.refresh_token, 'not-logged')
    assert.equal((await stat(storePath)).mode & 0o077, 0)
    assert.doesNotMatch(await readFile(storePath, 'utf8'), /ROBINHOOD_MCP_ACCESS_TOKEN/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
