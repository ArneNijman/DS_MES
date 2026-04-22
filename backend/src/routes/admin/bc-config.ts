import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { bcConfig } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { encryptSecret, isEncrypted } from '../../utils/crypto.js'
import { BCClient } from '../../bc/client.js'
import { startPolling } from '../../bc/poller.js'

const configSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  baseUrl: z.string().url(),
})

export async function adminBcConfigRoutes(fastify: FastifyInstance) {
  // GET huidige config (clientSecret gemaskeerd)
  fastify.get(
    '/admin/bc-config',
    { preHandler: [fastify.requireAdmin] },
    async () => {
      const configs = await fastify.db.select().from(bcConfig).limit(1)
      if (!configs.length) {
        return { tenantId: '', clientId: '', clientSecret: '', baseUrl: '', isActive: false }
      }
      const c = configs[0]
      return {
        tenantId: c.tenantId,
        clientId: c.clientId,
        clientSecret: '***',
        baseUrl: c.baseUrl,
        isActive: c.isActive,
        lastTestedAt: c.lastTestedAt,
        lastTestResult: c.lastTestResult,
      }
    },
  )

  // POST verbinding testen (zonder opslaan)
  fastify.post(
    '/admin/bc-config/test',
    { preHandler: [fastify.requireAdmin] },
    async (req, reply) => {
      const body = configSchema.safeParse(req.body)
      if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })

      const { tenantId, clientId, clientSecret, baseUrl } = body.data
      const plainSecret = isEncrypted(clientSecret) ? clientSecret : clientSecret

      const client = new BCClient({ tenantId, clientId, clientSecret: plainSecret, baseUrl })
      const result = await client.test()

      return {
        success: result.tokenOk && result.apiOk,
        steps: {
          token: result.tokenOk,
          api: result.apiOk,
          data: result.dataOk,
        },
        error: result.error,
      }
    },
  )

  // POST opslaan
  fastify.post(
    '/admin/bc-config',
    { preHandler: [fastify.requireAdmin] },
    async (req, reply) => {
      const body = configSchema.safeParse(req.body)
      if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })

      const { tenantId, clientId, clientSecret, baseUrl } = body.data
      const encryptedSecret = isEncrypted(clientSecret)
        ? clientSecret
        : encryptSecret(clientSecret)

      const existing = await fastify.db.select().from(bcConfig).limit(1)
      if (existing.length) {
        await fastify.db
          .update(bcConfig)
          .set({ tenantId, clientId, clientSecret: encryptedSecret, baseUrl, isActive: true, updatedAt: new Date() })
          .where(eq(bcConfig.id, existing[0].id))
      } else {
        await fastify.db.insert(bcConfig).values({
          tenantId,
          clientId,
          clientSecret: encryptedSecret,
          baseUrl,
          isActive: true,
        })
      }

      startPolling(fastify)
      return { ok: true }
    },
  )
}
