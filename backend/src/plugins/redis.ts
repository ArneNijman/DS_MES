import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { Redis } from 'ioredis'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const redisUrl = process.env.REDIS_URL ?? 'redis://redis:6379'

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  })

  redis.on('error', (err: Error) => {
    fastify.log.warn({ err }, 'Redis verbindingsfout')
  })

  await redis.connect()
  fastify.decorate('redis', redis)

  fastify.addHook('onClose', async () => {
    await redis.quit()
  })
})
