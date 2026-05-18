import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, desc, and } from 'drizzle-orm'
import { cncMachineEvents, cncProgramRuns } from '../../db/schema.js'

const eventPayloadSchema = z.object({
  eventType:   z.string(),
  eventData:   z.record(z.unknown()).optional().nullable(),
  programName: z.string().optional().nullable(),
  occurredAt:  z.string(), // ISO8601
})

const batchEventsSchema = z.object({
  events: z.array(eventPayloadSchema).min(1).max(500),
})

const programRunSchema = z.object({
  programName: z.string(),
  startedAt:   z.string(),
  endedAt:     z.string().optional().nullable(),
  status:      z.enum(['running', 'completed', 'interrupted']).default('running'),
})

export async function cncEventsRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAdmin] }

  // ── GET events ────────────────────────────────────────────────────────────

  fastify.get('/admin/machines/:id/cnc-events', auth, async (req) => {
    const { id }  = req.params as { id: string }
    const q       = req.query  as { limit?: string; eventType?: string }
    const limit   = Math.min(parseInt(q.limit ?? '100', 10), 500)

    const conditions = [eq(cncMachineEvents.machineId, id)]
    if (q.eventType) conditions.push(eq(cncMachineEvents.eventType, q.eventType))

    return fastify.db
      .select()
      .from(cncMachineEvents)
      .where(and(...conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]))
      .orderBy(desc(cncMachineEvents.occurredAt))
      .limit(limit)
  })

  // ── GET program runs ──────────────────────────────────────────────────────

  fastify.get('/admin/machines/:id/cnc-program-runs', auth, async (req) => {
    const { id } = req.params as { id: string }
    const q      = req.query  as { limit?: string }
    const limit  = Math.min(parseInt(q.limit ?? '50', 10), 200)

    return fastify.db
      .select()
      .from(cncProgramRuns)
      .where(eq(cncProgramRuns.machineId, id))
      .orderBy(desc(cncProgramRuns.startedAt))
      .limit(limit)
  })

  // ── POST events (van de agent) ────────────────────────────────────────────

  fastify.post('/admin/machines/:id/cnc-events', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body   = batchEventsSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige invoer' })

    const rows = body.data.events.map((e) => ({
      machineId:   id,
      eventType:   e.eventType,
      eventData:   e.eventData ?? null,
      programName: e.programName ?? null,
      occurredAt:  new Date(e.occurredAt),
    }))

    await fastify.db.insert(cncMachineEvents).values(rows)
    return { inserted: rows.length }
  })

  // ── POST program run (van de agent) ──────────────────────────────────────

  fastify.post('/admin/machines/:id/cnc-program-runs', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body   = programRunSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige invoer' })

    const startedAt = new Date(body.data.startedAt)
    const endedAt   = body.data.endedAt ? new Date(body.data.endedAt) : null
    const duration  = endedAt
      ? Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
      : null

    const [run] = await fastify.db
      .insert(cncProgramRuns)
      .values({
        machineId:       id,
        programName:     body.data.programName,
        startedAt,
        endedAt,
        durationSeconds: duration,
        status:          body.data.status,
      })
      .onConflictDoNothing()
      .returning()

    return run ?? { ok: true }
  })
}
