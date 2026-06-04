import { FastifyInstance } from 'fastify'
import { and, eq, isNull, lt, gt, desc } from 'drizzle-orm'
import { cncProgramRuns, cncMachineEvents } from '../db/schema.js'

// Run geldt als stale als het laatste event MACHINE_OFFLINE is
// én dat event meer dan STALE_THRESHOLD_MS geleden plaatsvond.
// ALARM_TRIGGERED wordt bewust niet meegenomen — alarmen kunnen voorwaarschuwingen zijn
// waarna het programma gewoon doorloopt.
const STALE_THRESHOLD_MS = 30 * 60 * 1000   // 30 minuten
const CHECK_INTERVAL_MS  =  5 * 60 * 1000   //  5 minuten

const STOP_EVENTS = new Set(['MACHINE_OFFLINE'])

async function closeStaleRuns(fastify: FastifyInstance) {
  const now = new Date()
  const cutoff = new Date(now.getTime() - STALE_THRESHOLD_MS)

  // Alle open runs waarvan startedAt meer dan 30 min geleden is
  const openRuns = await fastify.db
    .select()
    .from(cncProgramRuns)
    .where(
      and(
        isNull(cncProgramRuns.endedAt),
        lt(cncProgramRuns.startedAt, cutoff),
      ),
    )

  for (const run of openRuns) {
    // Haal het laatste event van deze machine na de runstart op
    const [lastEvent] = await fastify.db
      .select()
      .from(cncMachineEvents)
      .where(
        and(
          eq(cncMachineEvents.machineId, run.machineId),
          gt(cncMachineEvents.occurredAt, run.startedAt),
        ),
      )
      .orderBy(desc(cncMachineEvents.occurredAt))
      .limit(1)

    if (!lastEvent) continue
    if (!STOP_EVENTS.has(lastEvent.eventType)) continue

    // Laatste event is een stop-event én ouder dan drempelwaarde
    const eventAge = now.getTime() - lastEvent.occurredAt.getTime()
    if (eventAge < STALE_THRESHOLD_MS) continue

    const endedAt = lastEvent.occurredAt
    const durationSeconds = Math.round(
      (endedAt.getTime() - run.startedAt.getTime()) / 1000,
    )

    await fastify.db
      .update(cncProgramRuns)
      .set({ endedAt, durationSeconds, status: 'interrupted' })
      .where(eq(cncProgramRuns.id, run.id))

    fastify.log.info(
      `Stale run afgesloten: machine=${run.machineId} programma="${run.programName}" ` +
      `gestart=${run.startedAt.toISOString()} laatste_event=${lastEvent.eventType}`,
    )
  }
}

let handle: ReturnType<typeof setInterval> | null = null

export function startStaleRunChecker(fastify: FastifyInstance) {
  closeStaleRuns(fastify).catch((err) => fastify.log.error(err))
  handle = setInterval(() => {
    closeStaleRuns(fastify).catch((err) => fastify.log.error(err))
  }, CHECK_INTERVAL_MS)
}

export function stopStaleRunChecker() {
  if (handle) { clearInterval(handle); handle = null }
}
