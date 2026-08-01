import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
  OAuthClientMetadata,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from '@modelcontextprotocol/client'

export const DEFAULT_ROBINHOOD_MCP_URL = 'https://agent.robinhood.com/mcp/trading'
export const DEFAULT_ROBINHOOD_OAUTH_REDIRECT_PORT = 1456

interface RobinhoodOAuthStore {
  version: 1
  clientInformation?: StoredOAuthClientInformation
  tokens?: StoredOAuthTokens
  codeVerifier?: string
  authorizationState?: string
  discoveryState?: OAuthDiscoveryState
}

export function defaultRobinhoodOAuthStorePath(): string {
  return join(homedir(), '.config', 'stratum', 'robinhood-mcp-oauth.json')
}

export function getRobinhoodOAuthStorePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.ROBINHOOD_MCP_OAUTH_STORE?.trim() || defaultRobinhoodOAuthStorePath()
  if (!isAbsolute(configured)) throw new Error('ROBINHOOD_MCP_OAUTH_STORE must be an absolute worker-local path')
  return configured
}

export function hasRobinhoodOAuthCredentials(storePath: string): boolean {
  if (!existsSync(storePath)) return false
  try {
    const store = JSON.parse(readFileSync(storePath, 'utf8')) as Partial<RobinhoodOAuthStore>
    return typeof store.tokens?.access_token === 'string' && store.tokens.access_token.length > 0
  } catch {
    return false
  }
}

function emptyStore(): RobinhoodOAuthStore {
  return { version: 1 }
}

export class FileRobinhoodOAuthProvider implements OAuthClientProvider {
  readonly redirectUrl: string
  private readonly storePath: string
  private readonly onAuthorizationUrl?: (url: URL) => void | Promise<void>

  constructor({
    storePath,
    redirectUrl,
    onAuthorizationUrl,
  }: {
    storePath: string
    redirectUrl: string
    onAuthorizationUrl?: (url: URL) => void | Promise<void>
  }) {
    if (!isAbsolute(storePath)) throw new Error('Robinhood OAuth store path must be absolute')
    const parsedRedirect = new URL(redirectUrl)
    if (parsedRedirect.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedRedirect.hostname)) {
      throw new Error('Robinhood OAuth redirect URL must use a loopback host')
    }
    this.storePath = storePath
    this.redirectUrl = parsedRedirect.toString()
    this.onAuthorizationUrl = onAuthorizationUrl
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Stratum private portfolio reconciliation',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }
  }

  private async readStore(): Promise<RobinhoodOAuthStore> {
    if (!existsSync(this.storePath)) return emptyStore()
    const raw = await readFile(this.storePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<RobinhoodOAuthStore>
    if (parsed.version !== 1) throw new Error('Robinhood OAuth store has an unsupported format')
    return parsed as RobinhoodOAuthStore
  }

  private async updateStore(mutator: (store: RobinhoodOAuthStore) => void): Promise<void> {
    const store = await this.readStore()
    mutator(store)
    await mkdir(dirname(this.storePath), { recursive: true, mode: 0o700 })
    const temporaryPath = `${this.storePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(store)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporaryPath, this.storePath)
  }

  async clientInformation(): Promise<StoredOAuthClientInformation | undefined> {
    return (await this.readStore()).clientInformation
  }

  async saveClientInformation(clientInformation: StoredOAuthClientInformation): Promise<void> {
    await this.updateStore((store) => { store.clientInformation = clientInformation })
  }

  async tokens(): Promise<StoredOAuthTokens | undefined> {
    return (await this.readStore()).tokens
  }

  async saveTokens(tokens: StoredOAuthTokens): Promise<void> {
    await this.updateStore((store) => { store.tokens = tokens })
  }

  async state(): Promise<string> {
    const state = randomBytes(24).toString('base64url')
    await this.updateStore((store) => { store.authorizationState = state })
    return state
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    if (!this.onAuthorizationUrl) {
      throw new Error('Robinhood needs re-authorization. Run scripts/robinhood-mcp-auth.ts on the private worker.')
    }
    await this.onAuthorizationUrl(authorizationUrl)
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.updateStore((store) => { store.codeVerifier = codeVerifier })
  }

  async codeVerifier(): Promise<string> {
    const verifier = (await this.readStore()).codeVerifier
    if (!verifier) throw new Error('Robinhood authorization callback is missing its PKCE verifier')
    return verifier
  }

  async saveDiscoveryState(discoveryState: OAuthDiscoveryState): Promise<void> {
    await this.updateStore((store) => { store.discoveryState = discoveryState })
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    return (await this.readStore()).discoveryState
  }

  async hasExpectedState(state: string | null): Promise<boolean> {
    return Boolean(state) && state === (await this.readStore()).authorizationState
  }
}
