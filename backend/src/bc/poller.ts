import cron from 'node-cron'
import { FastifyInstance } from 'fastify'
import { bcSyncQueue } from '../jobs/queue.js'
import { bcConfig } from '../db/schema.js'
import { eq } from 'drizzle-orm'

let cronTask: cron.ScheduledTask | null = null

export function startPolling(fastify: FastifyInstance): void {
  if (cronTask) {
    cronTask.stop()
    cronTask = null
  }

  cronTask = cron.schedule('*/5 * * * *', async () => {
    try {
      const configs = await fastify.db
        .select()
        .from(bcConfig)
        .where(eq(bcConfig.isActive, true))
        .limit(1)

      if (!configs.length) return

      await bcSyncQueue.add('bc-sync', { type: 'sync-employees' })
      fastify.log.debug('BC sync job ingepland')
    } catch (err) {
      fastify.log.warn({ err }, 'BC poller fout')
    }
  })

  fastify.log.info('BC poller gestart (elke 5 minuten)')
}

export function stopPolling(): void {
  if (cronTask) {
    cronTask.stop()
    cronTask = null
  }
}
