import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  hasMarketsAuthConfig,
  isAllowedMarketUser,
  marketEmailAllowlist,
  marketsAuthBypassEnabled,
} from '../lib/auth/markets-auth.ts'

test('Markets allowlist is normalized and exact', () => {
  const environment = { MARKETS_ALLOWED_EMAILS: ' Owner@Example.com,second@example.com ' } as NodeJS.ProcessEnv
  assert.deepEqual([...marketEmailAllowlist(environment)], ['owner@example.com', 'second@example.com'])
  assert.equal(isAllowedMarketUser({ email: 'OWNER@example.com' }, environment), true)
  assert.equal(isAllowedMarketUser({ email: 'other@example.com' }, environment), false)
  assert.equal(isAllowedMarketUser(null, environment), false)
})

test('Markets auth requires public Supabase session configuration', () => {
  assert.equal(hasMarketsAuthConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  } as NodeJS.ProcessEnv), true)
  assert.equal(hasMarketsAuthConfig({ SUPABASE_URL: 'https://example.supabase.co' } as NodeJS.ProcessEnv), false)
})

test('auth bypass can never be enabled in production', () => {
  assert.equal(marketsAuthBypassEnabled({ NODE_ENV: 'development', MARKETS_AUTH_BYPASS: 'true' } as NodeJS.ProcessEnv), true)
  assert.equal(marketsAuthBypassEnabled({ NODE_ENV: 'production', MARKETS_AUTH_BYPASS: 'true' } as NodeJS.ProcessEnv), false)
})

test('Markets routes and APIs are both protected by the Next proxy', async () => {
  const source = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8')
  assert.match(source, /\/markets\/:path\*/)
  assert.match(source, /\/api\/markets\/:path\*/)
  assert.match(source, /isAllowedMarketUser/)
})
