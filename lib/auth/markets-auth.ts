const PASSWORD_SCHEME = 'pbkdf2-sha256'
const SESSION_VERSION = 'v1'
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
const MIN_SESSION_SECRET_LENGTH = 32

export const MARKETS_SESSION_COOKIE = 'stratum-markets-session'
export const MARKETS_OWNER_ID = '00000000-0000-4000-8000-000000000001'

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null
  const result = new Uint8Array(value.length / 2)
  for (let index = 0; index < result.length; index += 1) {
    result[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  }
  return result
}

function bytesToHex(value: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function constantTimeTextEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

function parsePasswordHash(value: string | undefined) {
  if (!value) return null
  const [scheme, iterationsText, saltHex, hashHex] = value.split('$')
  const iterations = Number.parseInt(iterationsText, 10)
  const salt = hexToBytes(saltHex)
  const expected = hexToBytes(hashHex)
  if (
    scheme !== PASSWORD_SCHEME
    || !Number.isInteger(iterations)
    || iterations < 100_000
    || iterations > 2_000_000
    || !salt
    || salt.length < 16
    || !expected
    || expected.length < 32
  ) return null
  return { iterations, salt, expected }
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
  length: number,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    length * 8,
  )
}

async function sessionSignature(
  payload: string,
  environment: NodeJS.ProcessEnv,
): Promise<string | null> {
  const secret = environment.MARKETS_SESSION_SECRET
  if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) return null
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return bytesToHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
}

export function hasMarketsAuthConfig(environment: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    parsePasswordHash(environment.MARKETS_ACCESS_PASSWORD_HASH)
    && environment.MARKETS_SESSION_SECRET
    && environment.MARKETS_SESSION_SECRET.length >= MIN_SESSION_SECRET_LENGTH,
  )
}

export async function verifyMarketsPassword(
  password: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (!password || password.length > 256) return false
  const config = parsePasswordHash(environment.MARKETS_ACCESS_PASSWORD_HASH)
  if (!config) return false
  const actual = bytesToHex(await pbkdf2(
    password,
    config.salt,
    config.iterations,
    config.expected.length,
  ))
  return constantTimeTextEqual(actual, bytesToHex(config.expected))
}

export async function createMarketsPasswordHash(
  password: string,
  salt: Uint8Array,
  iterations = 310_000,
): Promise<string> {
  if (!password || password.length > 256) throw new Error('Password must be between 1 and 256 characters')
  if (salt.length < 16) throw new Error('Password salt must contain at least 16 bytes')
  const derived = await pbkdf2(password, salt, iterations, 32)
  return `${PASSWORD_SCHEME}$${iterations}$${bytesToHex(salt)}$${bytesToHex(derived)}`
}

export async function createMarketsSessionToken(
  environment: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): Promise<string | null> {
  if (!hasMarketsAuthConfig(environment)) return null
  const expires = Math.floor(now / 1_000) + SESSION_MAX_AGE_SECONDS
  const payload = `${SESSION_VERSION}.${expires}`
  const signature = await sessionSignature(payload, environment)
  return signature ? `${payload}.${signature}` : null
}

export async function verifyMarketsSessionToken(
  token: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): Promise<boolean> {
  if (!token || !hasMarketsAuthConfig(environment)) return false
  const [version, expiresText, signature, extra] = token.split('.')
  if (extra !== undefined || version !== SESSION_VERSION || !/^\d+$/.test(expiresText) || !signature) return false
  const expires = Number.parseInt(expiresText, 10)
  const nowSeconds = Math.floor(now / 1_000)
  if (expires <= nowSeconds || expires > nowSeconds + SESSION_MAX_AGE_SECONDS + 60) return false
  const expected = await sessionSignature(`${version}.${expires}`, environment)
  return Boolean(expected && constantTimeTextEqual(signature, expected))
}

export function marketsSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  }
}

export function marketsAuthBypassEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.NODE_ENV !== 'production' && environment.MARKETS_AUTH_BYPASS === 'true'
}
