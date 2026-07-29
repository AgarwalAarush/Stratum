import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  MARKETS_OWNER_ID,
  createMarketsPasswordHash,
  createMarketsSessionToken,
  hasMarketsAuthConfig,
  marketsAuthBypassEnabled,
  verifyMarketsPassword,
  verifyMarketsSessionToken,
} from '../lib/auth/markets-auth.ts'

const salt = new Uint8Array([
  0, 1, 2, 3, 4, 5, 6, 7,
  8, 9, 10, 11, 12, 13, 14, 15,
])

async function authEnvironment(): Promise<NodeJS.ProcessEnv> {
  return {
    MARKETS_ACCESS_PASSWORD_HASH: await createMarketsPasswordHash('private password', salt, 100_000),
    MARKETS_SESSION_SECRET: 'a-test-session-secret-with-at-least-32-characters',
  } as NodeJS.ProcessEnv
}

test('Markets password configuration is hashed and verified exactly', async () => {
  const environment = await authEnvironment()
  assert.equal(hasMarketsAuthConfig(environment), true)
  assert.equal(await verifyMarketsPassword('private password', environment), true)
  assert.equal(await verifyMarketsPassword('Private password', environment), false)
  assert.equal(await verifyMarketsPassword('', environment), false)
  assert.equal(environment.MARKETS_ACCESS_PASSWORD_HASH?.includes('private password'), false)
})

test('Markets auth rejects incomplete or weak session configuration', async () => {
  const hash = await createMarketsPasswordHash('private password', salt, 100_000)
  assert.equal(hasMarketsAuthConfig({ MARKETS_ACCESS_PASSWORD_HASH: hash } as NodeJS.ProcessEnv), false)
  assert.equal(hasMarketsAuthConfig({
    MARKETS_ACCESS_PASSWORD_HASH: hash,
    MARKETS_SESSION_SECRET: 'too-short',
  } as NodeJS.ProcessEnv), false)
})

test('Markets sessions are signed, expire, and cannot be modified', async () => {
  const environment = await authEnvironment()
  const now = Date.UTC(2026, 6, 28)
  const token = await createMarketsSessionToken(environment, now)
  assert.ok(token)
  assert.equal(await verifyMarketsSessionToken(token, environment, now + 60_000), true)
  assert.equal(await verifyMarketsSessionToken(`${token.slice(0, -1)}0`, environment, now + 60_000), false)
  assert.equal(await verifyMarketsSessionToken(token, environment, now + 31 * 24 * 60 * 60 * 1_000), false)
})

test('password sessions use a stable non-auth-schema owner id', () => {
  assert.match(MARKETS_OWNER_ID, /^[0-9a-f-]{36}$/)
  assert.notEqual(MARKETS_OWNER_ID, 'local-development-user')
})

test('auth bypass can never be enabled in production', () => {
  assert.equal(marketsAuthBypassEnabled({ NODE_ENV: 'development', MARKETS_AUTH_BYPASS: 'true' } as NodeJS.ProcessEnv), true)
  assert.equal(marketsAuthBypassEnabled({ NODE_ENV: 'production', MARKETS_AUTH_BYPASS: 'true' } as NodeJS.ProcessEnv), false)
})

test('Markets routes and APIs are both protected by the signed-cookie proxy', async () => {
  const source = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8')
  assert.match(source, /\/markets\/:path\*/)
  assert.match(source, /\/api\/markets\/:path\*/)
  assert.match(source, /verifyMarketsSessionToken/)
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/)
})

test('password owner migration removes user records from the Supabase auth schema', async () => {
  const source = await readFile(
    new URL('../supabase/migrations/202607280005_private_password_owner.sql', import.meta.url),
    'utf8',
  )
  assert.match(source, /create table if not exists public\.market_users/)
  assert.match(source, /references public\.market_users/)
  assert.doesNotMatch(source, /references auth\.users/)
})
