import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, desc, and, asc, gte } from 'drizzle-orm'
import { cncMachineEvents, cncProgramRuns, machines } from '../../db/schema.js'

// ── Downtime derivation ────────────────────────────────────────────────────

type DowntimePeriod = {
  type: 'offline' | 'alarmstilstand' | 'stilstand' | 'wachttijd'
  startedAt: Date
  endedAt: Date | null
  durationSeconds: number | null
  isOngoing: boolean
}

function makePeriod(type: DowntimePeriod['type'], start: Date, end: Date | null): DowntimePeriod {
  return {
    type,
    startedAt:       start,
    endedAt:         end,
    durationSeconds: end ? Math.round((end.getTime() - start.getTime()) / 1000) : null,
    isOngoing:       end === null,
  }
}

function deriveDowntimePeriods(events: (typeof cncMachineEvents.$inferSelect)[]) {
  const periods: DowntimePeriod[] = []
  let offlineStart:    Date | null = null
  let alarmStart:      Date | null = null
  let programStopTime: Date | null = null
  let online = true

  for (const ev of events) {
    const t = new Date(ev.occurredAt)
    switch (ev.eventType) {
      case 'MACHINE_OFFLINE':
        offlineStart = t; online = false; break
      case 'MACHINE_ONLINE':
        if (offlineStart) periods.push(makePeriod('offline', offlineStart, t))
        offlineStart = null; online = true; break
      case 'ALARM_TRIGGERED':
        alarmStart = t; break
      case 'ALARM_CLEARED':
        if (alarmStart) periods.push(makePeriod('alarmstilstand', alarmStart, t))
        alarmStart = null; break
      case 'PROGRAM_STOPPED':
        if (online) programStopTime = t; break
      case 'PROGRAM_STARTED':
        if (programStopTime) {
          const gapSec = (t.getTime() - programStopTime.getTime()) / 1000
          if (gapSec > 300) periods.push(makePeriod('stilstand', programStopTime, t))
          programStopTime = null
        }
        break
    }
  }

  const now = new Date()
  if (offlineStart)   periods.push(makePeriod('offline', offlineStart, null))
  if (alarmStart)     periods.push(makePeriod('alarmstilstand', alarmStart, null))
  if (programStopTime && (now.getTime() - programStopTime.getTime()) / 1000 > 300)
    periods.push(makePeriod('stilstand', programStopTime, null))

  const summary = { offline: 0, alarmstilstand: 0, stilstand: 0, wachttijd: 0 }
  for (const p of periods) summary[p.type] += p.durationSeconds ?? 0

  return {
    periods: periods.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()),
    summary,
  }
}

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
  status:      z.enum(['running', 'completed', 'interrupted', 'error', 'stopped']).default('running'),
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

  // ── GET downtime periods — per machine ────────────────────────────────────

  fastify.get('/admin/machines/:id/cnc-downtime', auth, async (req) => {
    const { id } = req.params as { id: string }
    const q      = req.query  as { days?: string }
    const days   = Math.min(parseInt(q.days ?? '7', 10), 366)
    const since  = new Date(Date.now() - days * 86_400_000)

    const events = await fastify.db
      .select()
      .from(cncMachineEvents)
      .where(and(eq(cncMachineEvents.machineId, id), gte(cncMachineEvents.occurredAt, since)))
      .orderBy(asc(cncMachineEvents.occurredAt))

    return deriveDowntimePeriods(events)
  })

  // ── GET downtime summary — alle Freesmachines ─────────────────────────────

  fastify.get('/admin/cnc-downtime/all', auth, async (req) => {
    const q    = req.query as { days?: string }
    const days = Math.min(parseInt(q.days ?? '7', 10), 366)
    const since = new Date(Date.now() - days * 86_400_000)

    const freesmachines = await fastify.db
      .select()
      .from(machines)
      .where(eq(machines.category, 'Freesmachine'))

    const result = await Promise.all(
      freesmachines.map(async (m) => {
        const events = await fastify.db
          .select()
          .from(cncMachineEvents)
          .where(and(eq(cncMachineEvents.machineId, m.id), gte(cncMachineEvents.occurredAt, since)))
          .orderBy(asc(cncMachineEvents.occurredAt))

        const { periods, summary } = deriveDowntimePeriods(events)
        const periodMinutes        = days * 24 * 60
        const totalDowntimeSec     = Object.values(summary).reduce((a, b) => a + b, 0)
        const availabilityPct      = Math.max(0, Math.round((1 - totalDowntimeSec / (periodMinutes * 60)) * 100))
        const ongoingPeriod        = periods.find(p => p.isOngoing) ?? null

        return {
          id:   m.id,
          name: m.name,
          availabilityPct,
          totalDowntimeMinutes: Math.round(totalDowntimeSec / 60),
          byType: {
            offline:        Math.round(summary.offline / 60),
            alarmstilstand: Math.round(summary.alarmstilstand / 60),
            stilstand:      Math.round(summary.stilstand / 60),
            wachttijd:      Math.round(summary.wachttijd / 60),
          },
          ongoingPeriod,
          periods,
        }
      })
    )

    return { machines: result, days }
  })
}
