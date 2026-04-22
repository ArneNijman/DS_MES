import { FastifyInstance } from 'fastify'
import { and, eq, isNotNull } from 'drizzle-orm'
import { maintenanceTasks } from '../db/schema.js'

const INTERVAL_MS: Record<string, number> = {
  wekelijks:   7   * 24 * 60 * 60 * 1000,
  maandelijks: 30  * 24 * 60 * 60 * 1000,
  kwartaal:    91  * 24 * 60 * 60 * 1000,
  halfjaar:    182 * 24 * 60 * 60 * 1000,
  jaarlijks:   365 * 24 * 60 * 60 * 1000,
}

async function checkIntervals(fastify: FastifyInstance) {
  const tasks = await fastify.db
    .select()
    .from(maintenanceTasks)
    .where(
      and(
        eq(maintenanceTasks.status, 'gereed'),
        isNotNull(maintenanceTasks.interval),
        isNotNull(maintenanceTasks.completedDate),
      ),
    )

  const now = Date.now()
  for (const task of tasks) {
    if (!task.interval || !task.completedDate) continue
    const intervalMs = INTERVAL_MS[task.interval]
    if (!intervalMs) continue
    const completedAt = new Date(task.completedDate).getTime()
    if (isNaN(completedAt)) continue
    if (now - completedAt >= intervalMs) {
      await fastify.db
        .update(maintenanceTasks)
        .set({ status: 'gepland', completedDate: null })
        .where(eq(maintenanceTasks.id, task.id))
      fastify.log.info(
        `Onderhoudstaak "${task.title}" (${task.id}) teruggezet naar gepland (interval: ${task.interval})`,
      )
    }
  }
}

let handle: ReturnType<typeof setInterval> | null = null

export function startMaintenanceIntervalChecker(fastify: FastifyInstance) {
  checkIntervals(fastify).catch((err) => fastify.log.error(err))
  handle = setInterval(() => {
    checkIntervals(fastify).catch((err) => fastify.log.error(err))
  }, 60 * 60 * 1000) // elk uur
}

export function stopMaintenanceIntervalChecker() {
  if (handle) { clearInterval(handle); handle = null }
}
