import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, gte, asc } from 'drizzle-orm'
import { machines, cncMachineMetrics } from '../../db/schema.js'

const metricsPayloadSchema = z.object({
  spindleHours: z.number().nonnegative(),
})

export async function cncMetricsRoutes(fastify: FastifyInstance) {
  const auth     = { preHandler: [fastify.requireAdmin] }
  const authRead = { preHandler: [fastify.requireAuth] }

  // ── POST spindle hours (van de agent) ─────────────────────────────────────
  // Slaat huidige stand op in machines.spindle_hours én logt in cnc_machine_metrics

  fastify.post('/admin/machines/:id/cnc-metrics', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body   = metricsPayloadSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige invoer' })

    const { spindleHours } = body.data

    await Promise.all([
      fastify.db
        .update(machines)
        .set({ spindleHours: String(spindleHours) })
        .where(eq(machines.id, id)),

      fastify.db
        .insert(cncMachineMetrics)
        .values({ machineId: id, metricType: 'spindle_hours', value: String(spindleHours) }),
    ])

    return { ok: true }
  })

  // ── GET historische metrics ────────────────────────────────────────────────

  fastify.get('/admin/machines/:id/cnc-metrics', authRead, async (req) => {
    const { id } = req.params as { id: string }
    const q      = req.query  as { metric?: string; days?: string; since?: string }
    const metric = q.metric ?? 'spindle_hours'
    const since  = q.since
      ? new Date(q.since)
      : new Date(Date.now() - Math.min(parseInt(q.days ?? '30', 10), 366) * 86_400_000)

    const rows = await fastify.db
      .select()
      .from(cncMachineMetrics)
      .where(and(
        eq(cncMachineMetrics.machineId, id),
        eq(cncMachineMetrics.metricType, metric),
        gte(cncMachineMetrics.recordedAt, since),
      ))
      .orderBy(asc(cncMachineMetrics.recordedAt))

    // Aggregeer per dag (laatste meting van de dag)
    const byDay = new Map<string, { date: string; value: number }>()
    for (const row of rows) {
      const date = new Date(row.recordedAt).toISOString().slice(0, 10)
      byDay.set(date, { date, value: Number(row.value) })
    }

    return { data: [...byDay.values()] }
  })
}
