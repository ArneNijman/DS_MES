import {
  ConfidentialClientApplication,
  Configuration,
} from '@azure/msal-node'
import { FastifyInstance } from 'fastify'
import { bcConfig } from '../db/schema.js'
import { decryptSecret, isEncrypted } from '../utils/crypto.js'
import { eq } from 'drizzle-orm'

interface BCClientOptions {
  tenantId: string
  clientId: string
  clientSecret: string
  baseUrl: string
}

interface TestResult {
  tokenOk: boolean
  apiOk: boolean
  dataOk: boolean
  error?: string
}

export class BCClient {
  private options: BCClientOptions
  private msalApp: ConfidentialClientApplication
  private cachedToken: string | null = null
  private tokenExpiry: number = 0

  constructor(options: BCClientOptions) {
    this.options = options
    const msalConfig: Configuration = {
      auth: {
        clientId: options.clientId,
        authority: `https://login.microsoftonline.com/${options.tenantId}`,
        clientSecret: options.clientSecret,
      },
    }
    this.msalApp = new ConfidentialClientApplication(msalConfig)
  }

  async getToken(): Promise<string> {
    const now = Date.now()
    if (this.cachedToken && now < this.tokenExpiry - 60_000) {
      return this.cachedToken
    }

    const result = await this.msalApp.acquireTokenByClientCredential({
      scopes: ['https://api.businesscentral.dynamics.com/.default'],
    })

    if (!result?.accessToken) throw new Error('Geen access token ontvangen van Azure AD')

    this.cachedToken = result.accessToken
    this.tokenExpiry = result.expiresOn
      ? result.expiresOn.getTime()
      : now + 3600_000

    return this.cachedToken
  }

  async get<T = unknown>(path: string): Promise<T> {
    const token = await this.getToken()
    const url = `${this.options.baseUrl}${path}`
    const { default: fetch } = await import('node-fetch')
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`BC API fout: ${res.status} ${res.statusText} — ${url}`)
    return res.json() as T
  }

  async test(): Promise<TestResult> {
    const result: TestResult = { tokenOk: false, apiOk: false, dataOk: false }

    try {
      await this.getToken()
      result.tokenOk = true
    } catch (err) {
      result.error = `Token: ${err instanceof Error ? err.message : String(err)}`
      return result
    }

    try {
      const companies = await this.get<{ value: unknown[] }>('/companies')
      result.apiOk = true
      result.dataOk = Array.isArray(companies.value) && companies.value.length > 0
    } catch (err) {
      result.error = `API: ${err instanceof Error ? err.message : String(err)}`
    }

    return result
  }

  getBaseUrl(): string {
    return this.options.baseUrl
  }
}

export async function createBCClientFromDB(
  fastify: FastifyInstance,
): Promise<BCClient | null> {
  const configs = await fastify.db
    .select()
    .from(bcConfig)
    .where(eq(bcConfig.isActive, true))
    .limit(1)

  if (!configs.length) return null

  const config = configs[0]
  const secret = isEncrypted(config.clientSecret)
    ? decryptSecret(config.clientSecret)
    : config.clientSecret

  return new BCClient({
    tenantId: config.tenantId,
    clientId: config.clientId,
    clientSecret: secret,
    baseUrl: config.baseUrl,
  })
}
