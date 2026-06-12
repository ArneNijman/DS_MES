import { FastifyInstance } from 'fastify'
import { and, asc, desc, eq, gt } from 'drizzle-orm'
import { cncMachineEvents, machines } from '../db/schema.js'

// Elke 3 uur checken — alarmen die nooit een ALARM_CLEARED kregen
const CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000

async function checkAlarmConsistency(fastify: FastifyInstance) {
  const freesmachines = await fastify.db
    .select({ id: machines.id, name: machines.name })
    .from(machines)
    .where(eq(machines.category, 'Freesmachine'))

  for (const m of freesmachines) {
    // Meest recente ALARM_TRIGGERED per machine
    const [lastAlarm] = await fastify.db
      .select({ id: cncMachineEvents.id, occurredAt: cncMachineEvents.occurredAt })
      .from(cncMachineEvents)
      .where(and(
        eq(cncMachineEvents.machineId, m.id),
        eq(cncMachineEvents.eventType, 'ALARM_TRIGGERED'),
      ))
      .orderBy(desc(cncMachineEvents.occurredAt))
      .limit(1)

    if (!lastAlarm) continue

    // Al een ALARM_CLEARED na dit alarm?
    const [cleared] = await fastify.db
      .select({ id: cncMachineEvents.id })
      .from(cncMachineEvents)
      .where(and(
        eq(cncMachineEvents.machineId, m.id),
        eq(cncMachineEvents.eventType, 'ALARM_CLEARED'),
        gt(cncMachineEvents.occurredAt, lastAlarm.occurredAt),
      ))
      .limit(1)

    if (cleared) continue

    const alarmTime = new Date(lastAlarm.occurredAt)

    // Enige betrouwbare sluitsignaal: PROGRAM_STARTED na het alarm = machine hersteld
    const [programAfter] = await fastify.db
      .select({ occurredAt: cncMachineEvents.occurredAt })
      .from(cncMachineEvents)
      .where(and(
        eq(cncMachineEvents.machineId, m.id),
        eq(cncMachineEvents.eventType, 'PROGRAM_STARTED'),
        gt(cncMachineEvents.occurredAt, alarmTime),
      ))
      .orderBy(asc(cncMachineEvents.occurredAt))
      .limit(1)

    if (!programAfter) continue

    const clearAt = new Date(programAfter.occurredAt)
    const reason  = 'PROGRAM_STARTED na alarm — machine hersteld'

    await fastify.db.insert(cncMachineEvents).values({
      machineId:  m.id,
      eventType:  'ALARM_CLEARED',
      eventData:  { synthetic: true, reason },
      occurredAt: clearAt,
    })

    fastify.log.warn(
      `[staleAlarmChecker] synthetisch ALARM_CLEARED: machine=${m.name} op=${clearAt.toISOString()} reden="${reason}"`,
    )
  }
}

let handle: ReturnType<typeof setInterval> | null = null

export function startStaleAlarmChecker(fastify: FastifyInstance) {
  checkAlarmConsistency(fastify).catch(err => fastify.log.error(err))
  handle = setInterval(() => {
    checkAlarmConsistency(fastify).catch(err => fastify.log.error(err))
  }, CHECK_INTERVAL_MS)
}

export function stopStaleAlarmChecker() {
  if (handle) { clearInterval(handle); handle = null }
}
