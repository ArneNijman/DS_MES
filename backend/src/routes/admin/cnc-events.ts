import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, desc, and, asc, gte, like, sql, inArray, isNull } from 'drizzle-orm'
import { cncMachineEvents, cncProgramRuns, cncToolEntries, machines, toolLibraryAssemblies } from '../../db/schema.js'

/** Extraheert het artikel-mapje uit een programmapad: TNC:\Program\22073-3201-11\... → 22073-3201-11 */
function extractArticle(programName: string | null): string | null {
  if (!programName) return null
  const parts = programName.split(/[\\/]/)
  return parts.length >= 3 ? (parts[2] || null) : null
}

const STILSTAND_THRESHOLD_SEC = 600    // 10 minuten gap voor stilstand
const OFFLINE_MIN_SEC         = 300    // offline perioden korter dan 5 min worden genegeerd (monitoring-ruis)
const WACHTTIJD_MIN_SEC       = 30     // spindel min 30 sec stil tijdens programma voor wachttijd

/** Telt seconden die vallen op werkdagen (ma=1 t/m vr=5). Weekend wordt overgeslagen. */
function weekdaySeconds(start: Date, end: Date): number {
  if (end <= start) return 0
  let seconds = 0
  const cursor = new Date(start)
  while (cursor < end) {
    const dow = cursor.getDay()
    if (dow >= 1 && dow <= 5) {
      const eod = new Date(cursor)
      eod.setHours(23, 59, 59, 999)
      const dayEnd = eod < end ? eod : end
      seconds += Math.round((dayEnd.getTime() - cursor.getTime()) / 1000)
    }
    cursor.setDate(cursor.getDate() + 1)
    cursor.setHours(0, 0, 0, 0)
  }
  return seconds
}

// ── Downtime derivation ────────────────────────────────────────────────────

type DowntimePeriod = {
  type: 'offline' | 'alarmstilstand' | 'stilstand' | 'wachttijd'
  startedAt: Date
  endedAt: Date | null
  durationSeconds: number | null
  isOngoing: boolean
  alarmText?: string | null
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
  let alarmText:       string | null = null
  let programStopTime: Date | null = null
  let programRunning = false
  let spindleOffAt:    Date | null = null
  let online = true

  const closeWachttijd = (end: Date) => {
    if (!spindleOffAt) return
    if ((end.getTime() - spindleOffAt.getTime()) / 1000 >= WACHTTIJD_MIN_SEC)
      periods.push(makePeriod('wachttijd', spindleOffAt, end))
    spindleOffAt = null
  }

  for (const ev of events) {
    const t = new Date(ev.occurredAt)
    switch (ev.eventType) {
      case 'MACHINE_OFFLINE':
        if (online) {
          closeWachttijd(t)
          programRunning = false; spindleOffAt = null
          // Sluit lopend alarm af op offline-tijdstip zodat het niet doorlekt naar de volgende online-sessie
          if (alarmStart) {
            periods.push({ ...makePeriod('alarmstilstand', alarmStart, t), alarmText })
            alarmStart = null; alarmText = null
          }
          offlineStart = t; online = false
        }
        programStopTime = null
        break
      case 'MACHINE_ONLINE':
        if (offlineStart) {
          const dur = (t.getTime() - offlineStart.getTime()) / 1000
          if (dur >= OFFLINE_MIN_SEC) periods.push(makePeriod('offline', offlineStart, t))
        }
        offlineStart = null; online = true; break
      case 'ALARM_TRIGGERED':
        alarmStart = t
        alarmText  = (ev.eventData as { alarmText?: string } | null)?.alarmText ?? null
        break
      case 'ALARM_CLEARED':
        if (alarmStart) periods.push({ ...makePeriod('alarmstilstand', alarmStart, t), alarmText })
        alarmStart = null; alarmText = null; break
      case 'PROGRAM_STOPPED':
        closeWachttijd(t)
        programRunning = false; spindleOffAt = null
        if (online) programStopTime = t
        break
      case 'PROGRAM_STARTED':
        programRunning = true
        if (programStopTime) {
          const gapSec = (t.getTime() - programStopTime.getTime()) / 1000
          if (gapSec > STILSTAND_THRESHOLD_SEC) {
            periods.push(makePeriod('stilstand', programStopTime, t))
          }
          programStopTime = null
        }
        break
      case 'SPINDLE_OFF':
        if (programRunning && online) spindleOffAt = t
        break
      case 'SPINDLE_ON':
        closeWachttijd(t)
        break
    }
  }

  const now = new Date()
  if (offlineStart && (now.getTime() - offlineStart.getTime()) / 1000 >= OFFLINE_MIN_SEC)
    periods.push(makePeriod('offline', offlineStart, null))
  if (alarmStart && !offlineStart)
    periods.push({ ...makePeriod('alarmstilstand', alarmStart, null), alarmText })
  if (programStopTime && !offlineStart && (now.getTime() - programStopTime.getTime()) / 1000 > STILSTAND_THRESHOLD_SEC) {
    periods.push(makePeriod('stilstand', programStopTime, null))
  }
  if (programRunning && spindleOffAt && !offlineStart) {
    if ((now.getTime() - spindleOffAt.getTime()) / 1000 >= WACHTTIJD_MIN_SEC)
      periods.push(makePeriod('wachttijd', spindleOffAt, null))
  }

  const summary = { offline: 0, alarmstilstand: 0, stilstand: 0, wachttijd: 0 }
  for (const p of periods) summary[p.type] += weekdaySeconds(p.startedAt, p.endedAt ?? now)

  return {
    periods: periods.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()),
    summary,
  }
}

/** Strips garbage bytes vóór 'TNC:\' — LSV2 lekt soms binary data in de programmanaam */
function sanitizeProgramName(name: string): string | null {
  const idx = name.toUpperCase().indexOf('TNC:')
  const clean = idx > 0 ? name.slice(idx) : name.replace(/^[\x00-\x1F\x80-\xFF]+/, '')
  return clean.length >= 5 ? clean : null
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
  const auth     = { preHandler: [fastify.requireAdmin] }
  const authRead = { preHandler: [fastify.requireAuth] }  // kiosk + admin

  // ── GET events ────────────────────────────────────────────────────────────

  fastify.get('/admin/machines/:id/cnc-events', authRead, async (req) => {
    const { id }  = req.params as { id: string }
    const q       = req.query  as { limit?: string; eventType?: string }
    const limit   = Math.min(parseInt(q.limit ?? '100', 10), 500)

    const conditions = [
      eq(cncMachineEvents.machineId, id),
      sql`NOT (${cncMachineEvents.eventType} = 'ALARM_TRIGGERED' AND (
        ${cncMachineEvents.eventData}->>'alarmText' LIKE 'W100%' OR
        ${cncMachineEvents.eventData}->>'alarmText' LIKE '055 TC%'
      ))`,
    ]
    if (q.eventType) conditions.push(eq(cncMachineEvents.eventType, q.eventType))

    return fastify.db
      .select()
      .from(cncMachineEvents)
      .where(and(...conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]))
      .orderBy(desc(cncMachineEvents.occurredAt))
      .limit(limit)
  })

  // ── GET program runs ──────────────────────────────────────────────────────

  fastify.get('/admin/machines/:id/cnc-program-runs', authRead, async (req) => {
    const { id } = req.params as { id: string }
    const q      = req.query  as { limit?: string; article?: string }
    const limit  = Math.min(parseInt(q.limit ?? '50', 10), 500)

    const conditions = [eq(cncProgramRuns.machineId, id)]
    if (q.article) conditions.push(like(cncProgramRuns.programName, `%${q.article}%`))

    return fastify.db
      .select()
      .from(cncProgramRuns)
      .where(and(...conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]))
      .orderBy(desc(cncProgramRuns.startedAt))
      .limit(limit)
  })

  // ── GET program runs samenvatting per artikel ─────────────────────────────

  fastify.get('/admin/machines/:id/cnc-program-runs/summary', authRead, async (req) => {
    const { id } = req.params as { id: string }

    const runs = await fastify.db
      .select({
        programName:     cncProgramRuns.programName,
        durationSeconds: cncProgramRuns.durationSeconds,
        status:          cncProgramRuns.status,
      })
      .from(cncProgramRuns)
      .where(and(eq(cncProgramRuns.machineId, id), sql`${cncProgramRuns.durationSeconds} IS NOT NULL`))

    // Groepeer op artikel (derde padsegment)
    const byArticle = new Map<string, { totalSeconds: number; runCount: number }>()
    for (const run of runs) {
      const article = extractArticle(run.programName)
      if (!article) continue
      const existing = byArticle.get(article) ?? { totalSeconds: 0, runCount: 0 }
      existing.totalSeconds += run.durationSeconds ?? 0
      existing.runCount     += 1
      byArticle.set(article, existing)
    }

    return [...byArticle.entries()]
      .map(([article, s]) => ({ article, totalSeconds: s.totalSeconds, runCount: s.runCount }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
  })

  // ── GET verspaantijd samenvatting alle Freesmachines ─────────────────────

  fastify.get('/admin/cnc-program-runs/all', authRead, async (req) => {
    const q     = req.query as { since?: string }
    const since = q.since ? new Date(q.since) : new Date(Date.now() - 7 * 86_400_000)

    const freesmachines = await fastify.db
      .select({ id: machines.id, name: machines.name })
      .from(machines)
      .where(eq(machines.category, 'Freesmachine'))
      .orderBy(asc(machines.name))

    if (freesmachines.length === 0) return { machines: [] }

    const runs = await fastify.db
      .select({
        machineId:       cncProgramRuns.machineId,
        programName:     cncProgramRuns.programName,
        durationSeconds: cncProgramRuns.durationSeconds,
      })
      .from(cncProgramRuns)
      .where(and(
        inArray(cncProgramRuns.machineId, freesmachines.map(m => m.id)),
        gte(cncProgramRuns.startedAt, since),
        sql`${cncProgramRuns.durationSeconds} IS NOT NULL`,
      ))

    type MachineEntry = { totalSeconds: number; runCount: number; topArticles: Map<string, number> }
    const byMachine = new Map<string, MachineEntry>()
    for (const m of freesmachines) {
      byMachine.set(m.id, { totalSeconds: 0, runCount: 0, topArticles: new Map() })
    }

    for (const run of runs) {
      const entry = byMachine.get(run.machineId)
      if (!entry) continue
      const secs = run.durationSeconds ?? 0
      entry.totalSeconds += secs
      entry.runCount     += 1
      const article = extractArticle(run.programName)
      if (article) {
        entry.topArticles.set(article, (entry.topArticles.get(article) ?? 0) + secs)
      }
    }

    return {
      machines: freesmachines.map(m => {
        const entry = byMachine.get(m.id)!
        const topArticles = [...entry.topArticles.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([article, seconds]) => ({ article, seconds }))
        return { id: m.id, name: m.name, totalSeconds: entry.totalSeconds, runCount: entry.runCount, topArticles }
      }),
    }
  })

  // ── GET verspaantijd per artikel (zoekfunctie) ────────────────────────────

  fastify.get('/admin/cnc-program-runs/article-search', authRead, async (req, reply) => {
    const q       = req.query as { article?: string; since?: string }
    const search  = q.article?.trim()
    if (!search || search.length < 2) return reply.status(400).send({ error: 'Zoekterm te kort' })

    const since = q.since ? new Date(q.since) : new Date(Date.now() - 7 * 86_400_000)

    const freesmachines = await fastify.db
      .select({ id: machines.id, name: machines.name })
      .from(machines)
      .where(eq(machines.category, 'Freesmachine'))
      .orderBy(asc(machines.name))

    if (freesmachines.length === 0) return { article: search, totalSeconds: 0, totalRuns: 0, byMachine: [] }

    const runs = await fastify.db
      .select({
        machineId:       cncProgramRuns.machineId,
        programName:     cncProgramRuns.programName,
        durationSeconds: cncProgramRuns.durationSeconds,
      })
      .from(cncProgramRuns)
      .where(and(
        inArray(cncProgramRuns.machineId, freesmachines.map(m => m.id)),
        gte(cncProgramRuns.startedAt, since),
        like(cncProgramRuns.programName, `%${search}%`),
        sql`${cncProgramRuns.durationSeconds} IS NOT NULL`,
      ))

    // Groepeer op machine — artikel moet de zoekterm bevatten (partieel, case-insensitive)
    const machineMap  = new Map(freesmachines.map(m => [m.id, m.name]))
    type MEntry = { seconds: number; runCount: number; articles: Map<string, number> }
    const byMachine   = new Map<string, MEntry>()
    const searchLower = search.toLowerCase()

    for (const run of runs) {
      const article = extractArticle(run.programName)
      if (!article || !article.toLowerCase().includes(searchLower)) continue
      const secs  = run.durationSeconds ?? 0
      const entry = byMachine.get(run.machineId) ?? { seconds: 0, runCount: 0, articles: new Map() }
      entry.seconds  += secs
      entry.runCount += 1
      entry.articles.set(article, (entry.articles.get(article) ?? 0) + secs)
      byMachine.set(run.machineId, entry)
    }

    const result = [...byMachine.entries()]
      .map(([id, e]) => ({
        id,
        name:     machineMap.get(id) ?? id,
        seconds:  e.seconds,
        runCount: e.runCount,
        articles: [...e.articles.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([article, seconds]) => ({ article, seconds })),
      }))
      .sort((a, b) => b.seconds - a.seconds)

    return {
      article:      search,
      totalSeconds: result.reduce((s, m) => s + m.seconds, 0),
      totalRuns:    result.reduce((s, m) => s + m.runCount, 0),
      byMachine:    result,
    }
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

    // Auto-afleiden van program runs uit de event-stroom — voorkomt dat een mislukte
    // /cnc-program-runs POST de run-registratie uit de pas laat lopen met de events.
    for (const ev of body.data.events) {
      const t = new Date(ev.occurredAt)

      if (ev.eventType === 'PROGRAM_STARTED' && ev.programName) {
        const programName = sanitizeProgramName(ev.programName)
        if (!programName) continue

        // Sla over als de agent al een run aangemaakt heeft voor dit tijdstip
        const [existing] = await fastify.db
          .select({ id: cncProgramRuns.id })
          .from(cncProgramRuns)
          .where(and(eq(cncProgramRuns.machineId, id), eq(cncProgramRuns.startedAt, t)))
          .limit(1)
        if (existing) continue

        // Sluit eventuele open runs af
        await fastify.db
          .update(cncProgramRuns)
          .set({
            endedAt:         t,
            durationSeconds: sql`EXTRACT(EPOCH FROM (${t.toISOString()}::timestamptz - started_at))::int`,
            status:          'stopped',
          })
          .where(and(eq(cncProgramRuns.machineId, id), isNull(cncProgramRuns.endedAt)))

        await fastify.db.insert(cncProgramRuns).values({
          machineId:   id,
          programName,
          startedAt:   t,
          status:      'running',
        })
      }

      if (ev.eventType === 'PROGRAM_STOPPED') {
        await fastify.db
          .update(cncProgramRuns)
          .set({
            endedAt:         t,
            durationSeconds: sql`EXTRACT(EPOCH FROM (${t.toISOString()}::timestamptz - started_at))::int`,
            status:          'stopped',
          })
          .where(and(eq(cncProgramRuns.machineId, id), isNull(cncProgramRuns.endedAt)))
      }
    }

    return { inserted: rows.length }
  })

  // ── POST program run (van de agent) ──────────────────────────────────────

  fastify.post('/admin/machines/:id/cnc-program-runs', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body   = programRunSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige invoer' })

    const programName = sanitizeProgramName(body.data.programName)
    if (!programName) return reply.status(400).send({ error: 'Ongeldige programmanaam' })

    const startedAt = new Date(body.data.startedAt)
    const endedAt   = body.data.endedAt ? new Date(body.data.endedAt) : null
    const duration  = endedAt
      ? Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
      : null

    // Sluit alle nog-open runs voor deze machine — een machine draait maar één programma tegelijk
    if (!endedAt) {
      const openRuns = await fastify.db
        .select({ id: cncProgramRuns.id, startedAt: cncProgramRuns.startedAt })
        .from(cncProgramRuns)
        .where(and(eq(cncProgramRuns.machineId, id), isNull(cncProgramRuns.endedAt)))
      if (openRuns.length > 0) {
        await fastify.db
          .update(cncProgramRuns)
          .set({
            endedAt:         startedAt,
            durationSeconds: sql`EXTRACT(EPOCH FROM (${startedAt.toISOString()}::timestamptz - started_at))::int`,
            status:          'stopped',
          })
          .where(and(eq(cncProgramRuns.machineId, id), isNull(cncProgramRuns.endedAt)))
      }
    }

    const [run] = await fastify.db
      .insert(cncProgramRuns)
      .values({
        machineId:       id,
        programName,
        startedAt,
        endedAt,
        durationSeconds: duration,
        status:          body.data.status,
      })
      .onConflictDoNothing()
      .returning()

    return run ?? { ok: true }
  })

  // ── PATCH program run (agent sluit een lopende run af) ───────────────────

  fastify.patch('/admin/machines/:id/cnc-program-runs/:runId', auth, async (req, reply) => {
    const { id, runId } = req.params as { id: string; runId: string }
    const body = z.object({
      endedAt:  z.string(),
      status:   z.enum(['completed', 'interrupted', 'error', 'stopped']).default('completed'),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige invoer' })

    const endedAt = new Date(body.data.endedAt)

    const [existing] = await fastify.db
      .select({ startedAt: cncProgramRuns.startedAt })
      .from(cncProgramRuns)
      .where(and(eq(cncProgramRuns.id, runId), eq(cncProgramRuns.machineId, id)))
      .limit(1)

    if (!existing) return reply.status(404).send({ error: 'Run niet gevonden' })

    const durationSeconds = Math.round((endedAt.getTime() - existing.startedAt.getTime()) / 1000)

    const [updated] = await fastify.db
      .update(cncProgramRuns)
      .set({ endedAt, durationSeconds, status: body.data.status })
      .where(and(eq(cncProgramRuns.id, runId), eq(cncProgramRuns.machineId, id)))
      .returning()

    return updated
  })

  // ── GET downtime periods — per machine ────────────────────────────────────

  fastify.get('/admin/machines/:id/cnc-downtime', authRead, async (req) => {
    const { id } = req.params as { id: string }
    const q      = req.query  as { days?: string; since?: string }
    const since  = q.since ? new Date(q.since) : new Date(Date.now() - Math.min(parseInt(q.days ?? '7', 10), 366) * 86_400_000)

    const events = await fastify.db
      .select()
      .from(cncMachineEvents)
      .where(and(eq(cncMachineEvents.machineId, id), gte(cncMachineEvents.occurredAt, since)))
      .orderBy(asc(cncMachineEvents.occurredAt))

    return deriveDowntimePeriods(events)
  })

  // ── GET downtime summary — alle Freesmachines ─────────────────────────────

  fastify.get('/admin/cnc-downtime/all', authRead, async (req) => {
    const q     = req.query as { days?: string; since?: string }
    const since = q.since ? new Date(q.since) : new Date(Date.now() - Math.min(parseInt(q.days ?? '7', 10), 366) * 86_400_000)
    const days  = Math.ceil((Date.now() - since.getTime()) / 86_400_000)

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
        const periodWorkSec        = weekdaySeconds(since, new Date())
        const totalDowntimeSec     = summary.offline + summary.alarmstilstand + summary.stilstand
        const availabilityPct      = periodWorkSec === 0 ? 100 : Math.max(0, Math.floor((1 - totalDowntimeSec / periodWorkSec) * 100))
        const ongoingPeriod        = periods.find(p => p.isOngoing) ?? null

        // Actief gereedschap: meest recente TOOL_CHANGED event → naam opzoeken in tool-magazijn
        const [lastToolChange] = await fastify.db
          .select({ eventData: cncMachineEvents.eventData })
          .from(cncMachineEvents)
          .where(and(eq(cncMachineEvents.machineId, m.id), eq(cncMachineEvents.eventType, 'TOOL_CHANGED')))
          .orderBy(desc(cncMachineEvents.occurredAt))
          .limit(1)

        let currentTool: { nr: number; name: string | null; assemblyNcNumber: number | null } | null = null
        if (lastToolChange) {
          const d = lastToolChange.eventData as { from?: number; to?: number } | null
          const toolNr = d?.to ?? null
          if (toolNr !== null) {
            const [entry] = await fastify.db
              .select({ name: cncToolEntries.name })
              .from(cncToolEntries)
              .where(and(eq(cncToolEntries.machineId, m.id), eq(cncToolEntries.toolNumber, toolNr)))
              .limit(1)
            const toolName = entry?.name ?? null
            let assemblyNcNumber: number | null = null
            if (toolName) {
              const [asm] = await fastify.db
                .select({ ncNumber: toolLibraryAssemblies.ncNumber })
                .from(toolLibraryAssemblies)
                .where(eq(sql`LOWER(${toolLibraryAssemblies.ncName})`, toolName.toLowerCase()))
                .limit(1)
              assemblyNcNumber = asm?.ncNumber ?? null
            }
            currentTool = { nr: toolNr, name: toolName, assemblyNcNumber }
          }
        }

        // Actief programma: open run zonder endedAt
        const [openRun] = await fastify.db
          .select({ programName: cncProgramRuns.programName })
          .from(cncProgramRuns)
          .where(and(eq(cncProgramRuns.machineId, m.id), isNull(cncProgramRuns.endedAt)))
          .orderBy(desc(cncProgramRuns.startedAt))
          .limit(1)
        const programRunning = !!openRun
        const currentProgram = openRun?.programName ?? null

        // Status + programmanaam laatste run (alleen als niet actief)
        let lastRunStatus: string | null = null
        let lastRunProgram: string | null = null
        if (!programRunning) {
          const [lastRun] = await fastify.db
            .select({ status: cncProgramRuns.status, programName: cncProgramRuns.programName })
            .from(cncProgramRuns)
            .where(eq(cncProgramRuns.machineId, m.id))
            .orderBy(desc(cncProgramRuns.startedAt))
            .limit(1)
          lastRunStatus  = lastRun?.status      ?? null
          lastRunProgram = lastRun?.programName ?? null
        }

        return {
          id:   m.id,
          name: m.name,
          photoUrl: m.photoUrl ?? null,
          availabilityPct,
          totalDowntimeMinutes: Math.round(totalDowntimeSec / 60),
          byType: {
            offline:        Math.round(summary.offline / 60),
            alarmstilstand: Math.round(summary.alarmstilstand / 60),
            stilstand:      Math.round(summary.stilstand / 60),
            wachttijd:      Math.round(summary.wachttijd / 60),
          },
          ongoingPeriod,
          currentTool,
          programRunning,
          currentProgram,
          lastRunStatus,
          lastRunProgram,
          periods: periods.filter(p => weekdaySeconds(p.startedAt, p.endedAt ?? new Date()) > 0),
        }
      })
    )

    return { machines: result, days }
  })
}
