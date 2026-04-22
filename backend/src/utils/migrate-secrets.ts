import { FastifyInstance } from 'fastify'
import { bcConfig } from '../db/schema.js'
import { encryptSecret, isEncrypted } from './crypto.js'
import { eq } from 'drizzle-orm'

export async function migrateClientSecrets(fastify: FastifyInstance): Promise<void> {
  const encKey = process.env.BC_ENCRYPTION_KEY
  if (!encKey) {
    fastify.log.warn('BC_ENCRYPTION_KEY niet ingesteld — secrets migratie overgeslagen')
    return
  }

  try {
    const configs = await fastify.db.select().from(bcConfig)
    for (const config of configs) {
      if (!isEncrypted(config.clientSecret)) {
        const encrypted = encryptSecret(config.clientSecret)
        await fastify.db
          .update(bcConfig)
          .set({ clientSecret: encrypted })
          .where(eq(bcConfig.id, config.id))
        fastify.log.info(`BC clientSecret (id=${config.id}) versleuteld`)
      }
    }
  } catch (err) {
    fastify.log.warn({ err }, 'Secrets migratie mislukt — doorgaan')
  }
}
