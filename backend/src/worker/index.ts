import { Worker } from 'bullmq'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema.js'
import { BcSyncJobData } from '../jobs/queue.js'
import { BCClient } from '../bc/client.js'
import { syncEmployees } from '../bc/sync/employees.js'
import { bcConfig } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { decryptSecret, isEncrypted } from '../utils/crypto.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is niet ingesteld')

const client = postgres(databaseUrl)
const db = drizzle(client, { schema })

// Fastify-achtige interface voor de worker (zonder HTTP server)
const workerContext = {
  db,
  log: {
    info: (msg: unknown) => console.log('[worker]', msg),
    warn: (msg: unknown) => console.warn('[worker]', msg),
    error: (msg: unknown) => console.error('[worker]', msg),
    debug: (msg: unknown) => console.debug('[worker]', msg),
  },
}

function createRedisConnection() {
  const url = process.env.REDIS_URL ?? 'redis://redis:6379'
  const parsed = new URL(url)
  return { host: parsed.hostname, port: parseInt(parsed.port || '6379', 10) }
}

async function getBCClient(): Promise<BCClient | null> {
  const configs = await db.select().from(bcConfig).where(eq(bcConfig.isActive, true)).limit(1)
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

const worker = new Worker<BcSyncJobData>(
  'bc-sync',
  async (job) => {
    workerContext.log.info(`Job ontvangen: ${job.data.type}`)

    if (job.data.type === 'sync-employees' || job.data.type === 'sync-all') {
      const bcClient = await getBCClient()
      if (!bcClient) {
        workerContext.log.warn('Geen actieve BC configuratie — sync overgeslagen')
        return
      }
      // Worker heeft geen Fastify instance — gebruik een compatible object
      const result = await syncEmployees(bcClient, workerContext as never)
      workerContext.log.info(`Sync klaar: +${result.added} nieuw, ~${result.updated} bijgewerkt, ${result.errors.length} fouten`)
    }
  },
  { connection: createRedisConnection() },
)

worker.on('failed', (job, err) => {
  workerContext.log.error(`Job mislukt (${job?.id}): ${err.message}`)
})

const shutdown = async () => {
  await worker.close()
  await client.end()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

workerContext.log.info('Worker gestart')
