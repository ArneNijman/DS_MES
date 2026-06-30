import { FastifyInstance } from 'fastify'
import { and, eq, isNull, lt, gt, desc } from 'drizzle-orm'
import { cncProgramRuns, cncMachineEvents } from '../db/schema.js'

// Snelle detectie: MACHINE_OFFLINE ouder dan 30 minuten → run sluiten
const OFFLINE_THRESHOLD_MS = 30 * 60 * 1000   // 30 minuten
// Harde grens: run ouder dan 8 uur zonder afsluiting → phantom (programma was al klaar)
const HARD_CUTOFF_MS       =  8 * 60 * 60 * 1000  //  8 uur
const CHECK_INTERVAL_MS    =  5 * 60 * 1000   //  5 minuten

async function closeStaleRuns(fastify: FastifyInstance) {
  const now = new Date()

  const openRuns = await fastify.db
    .select()
    .from(cncProgramRuns)
    .where(
      and(
        isNull(cncProgramRuns.endedAt),
        lt(cncProgramRuns.startedAt, new Date(now.getTime() - OFFLINE_THRESHOLD_MS)),
      ),
    )

  for (const run of openRuns) {
    const runAgeMs = now.getTime() - run.startedAt.getTime()

    // Harde grens: run ouder dan 8 uur → phantom (programma was waarschijnlijk al klaar)
    // duration_seconds=0 zodat de `> 0` filter in project analyse deze uitsluit
    if (runAgeMs >= HARD_CUTOFF_MS) {
      await fastify.db
        .update(cncProgramRuns)
        .set({ endedAt: new Date(), durationSeconds: 0, status: 'phantom' })
        .where(eq(cncProgramRuns.id, run.id))

      fastify.log.warn(
        `Stale run (>8u) als phantom gesloten: machine=${run.machineId} programma="${run.programName}" ` +
        `gestart=${run.startedAt.toISOString()}`,
      )
      continue
    }

    // Snelle detectie: laatste event is MACHINE_OFFLINE én ouder dan 30 min
    const [lastEvent] = await fastify.db
      .select()
      .from(cncMachineEvents)
      .where(and(
        eq(cncMachineEvents.machineId, run.machineId),
        gt(cncMachineEvents.occurredAt, run.startedAt),
      ))
      .orderBy(desc(cncMachineEvents.occurredAt))
      .limit(1)

    if (!lastEvent || lastEvent.eventType !== 'MACHINE_OFFLINE') continue
    if (now.getTime() - lastEvent.occurredAt.getTime() < OFFLINE_THRESHOLD_MS) continue

    const endedAt = lastEvent.occurredAt
    const durationSeconds = Math.round((endedAt.getTime() - run.startedAt.getTime()) / 1000)

    await fastify.db
      .update(cncProgramRuns)
      .set({ endedAt, durationSeconds, status: 'interrupted' })
      .where(eq(cncProgramRuns.id, run.id))

    fastify.log.info(
      `Stale run (offline) gesloten: machine=${run.machineId} programma="${run.programName}" ` +
      `gestart=${run.startedAt.toISOString()}`,
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
