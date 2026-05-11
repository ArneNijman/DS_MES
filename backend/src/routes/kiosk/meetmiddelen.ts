import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  measuringTools, calibrationRecords, toolDocuments, machines,
  internalCalibrationSessions, calibrationMeasurementRows, employees,
} from '../../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { randomUUID } from 'crypto'
import path from 'path'

const PRIVILEGED_ROLES = ['admin', 'quality']

function requirePrivileged(req: any, reply: any) {
  const role = req.employee?.role ?? ''
  if (!PRIVILEGED_ROLES.includes(role)) {
    reply.status(403).send({ error: 'Geen rechten' })
    return false
  }
  return true
}

const INTERVALS = ['jaarlijks', 'halfjaarlijks', 'kwartaal', 'geen'] as const

const toolSchema = z.object({
  voorraadId:         z.string().optional().nullable(),
  artikelnaam:        z.string().optional().nullable(),
  merk:               z.string().optional().nullable(),
  afmeting:           z.string().optional().nullable(),
  kalibratiePlicht:   z.boolean().optional().nullable(),
  interval:           z.enum(INTERVALS).optional().nullable(),
  locatie:            z.string().optional().nullable(),
  emailTeamleider:    z.string().optional().nullable(),
  gebruiktDoor:       z.string().optional().nullable(),
  machineId:          z.string().uuid().optional().nullable(),
  teamleiderId:       z.string().uuid().optional().nullable(),
  actief:             z.boolean().optional().nullable(),
  interneKalibratie:  z.boolean().optional().nullable(),
  externeKalibratie:  z.boolean().optional().nullable(),
  eindmaatKalibratie: z.boolean().optional().nullable(),
  ringKalibratie:     z.boolean().optional().nullable(),
  diepteKalibratie:   z.boolean().optional().nullable(),
  afgekeurd:          z.boolean().optional().nullable(),
  afgekeurdReden:     z.string().optional().nullable(),
  serieSuffix:        z.string().optional().nullable(),
  instructie:         z.string().optional().nullable(),
})

const externalCalSchema = z.object({
  gekalibreerdDoor:   z.string().optional().nullable(),
  gekalibreerdDoorId: z.string().uuid().optional().nullable(),
  datum:              z.string().optional().nullable(),
  gecontroleerDoor:   z.string().optional().nullable(),
  gecontroleerDoorId: z.string().uuid().optional().nullable(),
  datumWeggestuurd:   z.string().optional().nullable(),
  datumTerug:         z.string().optional().nullable(),
})

const internalSessionSchema = z.object({
  voltooiingsdatum:   z.string().optional().nullable(),
  uitgevoerdDoor:     z.string().optional().nullable(),
  uitgevoerdDoorId:   z.string().uuid().optional().nullable(),
  gecontroleerDoor:   z.string().optional().nullable(),
  gecontroleerDoorId: z.string().uuid().optional().nullable(),
})

const measurementRowSchema = z.object({
  calType:       z.enum(['eindmaat', 'diepte', 'ring']),
  nomWaarde:     z.string().optional().nullable(),
  gemetenWaarde: z.string().optional().nullable(),
  tolerantie:    z.string().optional().nullable(),
  datum:         z.string().optional().nullable(),
  dinNorm:       z.string().optional().nullable(),
})

async function nextToolId(fastify: FastifyInstance): Promise<string> {
  const rows = await fastify.db
    .select({ toolId: measuringTools.toolId })
    .from(measuringTools)
    .orderBy(desc(measuringTools.createdAt))
    .limit(200)

  if (!rows.length) return 'MM-10001'

  const nums = rows
    .map((r) => parseInt(r.toolId.replace('MM-', ''), 10))
    .filter((n) => !isNaN(n))
  const max = Math.max(...nums)
  return `MM-${max + 1}`
}

export async function kioskMeetmiddelenRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  // ── Next ID ────────────────────────────────────────────────────────────────
  fastify.get('/kiosk/meetmiddelen/next-id', auth, async () => {
    return { toolId: await nextToolId(fastify) }
  })

  // ── List all ───────────────────────────────────────────────────────────────
  fastify.get('/kiosk/meetmiddelen', auth, async () => {
    const tools = await fastify.db
      .select()
      .from(measuringTools)
      .orderBy(desc(measuringTools.createdAt))

    const allCals = await fastify.db
      .select()
      .from(calibrationRecords)
      .orderBy(desc(calibrationRecords.createdAt))

    const allSessions = await fastify.db
      .select()
      .from(internalCalibrationSessions)
      .orderBy(desc(internalCalibrationSessions.createdAt))

    const machineIds = [...new Set(tools.map((t) => t.machineId).filter(Boolean))] as string[]
    let machineMap: Record<string, string> = {}
    if (machineIds.length) {
      const mRows = await fastify.db
        .select({ id: machines.id, name: machines.name, machineId: machines.machineId })
        .from(machines)
      mRows.forEach((m) => { machineMap[m.id] = m.name ?? m.machineId ?? m.id })
    }

    const calsByTool: Record<string, typeof allCals> = {}
    for (const cal of allCals) {
      if (!calsByTool[cal.toolId]) calsByTool[cal.toolId] = []
      calsByTool[cal.toolId].push(cal)
    }

    const sessionsByTool: Record<string, typeof allSessions> = {}
    for (const s of allSessions) {
      if (!sessionsByTool[s.toolId]) sessionsByTool[s.toolId] = []
      sessionsByTool[s.toolId].push(s)
    }

    return tools.map((t) => ({
      ...t,
      machineName: t.machineId ? (machineMap[t.machineId] ?? null) : null,
      calibrations: calsByTool[t.id] ?? [],
      internalSessions: sessionsByTool[t.id] ?? [],
    }))
  })

  // ── Create ─────────────────────────────────────────────────────────────────
  fastify.post('/kiosk/meetmiddelen', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const body = toolSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })
    const toolId = await nextToolId(fastify)
    const [tool] = await fastify.db
      .insert(measuringTools)
      .values({ ...body.data, toolId })
      .returning()
    return { ...tool, calibrations: [], internalSessions: [] }
  })

  // ── Calibration alerts ─────────────────────────────────────────────────────
  fastify.get('/kiosk/meetmiddelen/calibration-alerts', auth, async (req) => {
    const employee = (req as any).employee as { id: string; role: string }
    const MONTHS: Record<string, number> = { jaarlijks: 12, halfjaarlijks: 6, kwartaal: 3 }

    const tools = await fastify.db
      .select()
      .from(measuringTools)
      .where(eq(measuringTools.kalibratiePlicht, true))

    if (!tools.length) return { verlopen: [], kritisch: [] }

    const [allCals, allSessions] = await Promise.all([
      fastify.db.select().from(calibrationRecords),
      fastify.db.select().from(internalCalibrationSessions),
    ])

    const lastCalByTool: Record<string, string | null> = {}
    for (const c of allCals) {
      const existing = lastCalByTool[c.toolId]
      if (!existing || (c.datum && c.datum > existing)) lastCalByTool[c.toolId] = c.datum ?? null
    }
    for (const s of allSessions) {
      const existing = lastCalByTool[s.toolId]
      if (!existing || (s.voltooiingsdatum && s.voltooiingsdatum > existing)) lastCalByTool[s.toolId] = s.voltooiingsdatum ?? null
    }

    const now = Date.now()
    const verlopen: typeof tools = []
    const kritisch: typeof tools = []

    for (const t of tools) {
      if (!t.interval || t.interval === 'geen') continue
      const m = MONTHS[t.interval] ?? 12
      const lastDatum = lastCalByTool[t.id] ?? null

      let daysLeft: number
      if (!lastDatum) {
        daysLeft = -1
      } else {
        const next = new Date(lastDatum)
        next.setMonth(next.getMonth() + m)
        daysLeft = Math.floor((next.getTime() - now) / 86400000)
      }

      const isQuality = employee.role === 'quality'
      const isTeamleider = t.teamleiderId === employee.id
      if (!isQuality && !isTeamleider) continue

      if (daysLeft < 0) verlopen.push(t)
      else if (daysLeft <= 90) kritisch.push(t)
    }

    return { verlopen, kritisch }
  })

  // ── Update ─────────────────────────────────────────────────────────────────
  fastify.put('/kiosk/meetmiddelen/:id', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { id } = req.params as { id: string }
    const body = toolSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })
    const [tool] = await fastify.db
      .update(measuringTools)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(measuringTools.id, id))
      .returning()
    if (!tool) return reply.status(404).send({ error: 'Meetmiddel niet gevonden' })
    return tool
  })

  // ── Delete ─────────────────────────────────────────────────────────────────
  fastify.delete('/kiosk/meetmiddelen/:id', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { id } = req.params as { id: string }
    await fastify.db.delete(measuringTools).where(eq(measuringTools.id, id))
    return { ok: true }
  })

  // ── Photo upload ───────────────────────────────────────────────────────────
  fastify.post('/kiosk/meetmiddelen/:id/photo', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { id } = req.params as { id: string }
    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'Geen bestand' })
    const ext = path.extname(data.filename)
    const filename = `mm-photo-${randomUUID()}${ext}`
    const dest = `/app/uploads/${filename}`
    await pipeline(data.file, createWriteStream(dest))
    const photoUrl = `/uploads/${filename}`
    await fastify.db
      .update(measuringTools)
      .set({ photoUrl, updatedAt: new Date() })
      .where(eq(measuringTools.id, id))
    return { photoUrl }
  })

  // ── Externe calibration records ────────────────────────────────────────────
  fastify.get('/kiosk/meetmiddelen/:id/calibrations', auth, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select()
      .from(calibrationRecords)
      .where(eq(calibrationRecords.toolId, id))
      .orderBy(desc(calibrationRecords.createdAt))
  })

  fastify.post('/kiosk/meetmiddelen/:id/calibrations', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { id } = req.params as { id: string }
    const body = externalCalSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })
    const [record] = await fastify.db
      .insert(calibrationRecords)
      .values({ ...body.data, toolId: id, type: 'extern' })
      .returning()
    return record
  })

  fastify.put('/kiosk/meetmiddelen/:id/calibrations/:calId', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { calId } = req.params as { id: string; calId: string }
    const body = externalCalSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })
    const [record] = await fastify.db
      .update(calibrationRecords)
      .set(body.data)
      .where(eq(calibrationRecords.id, calId))
      .returning()
    if (!record) return reply.status(404).send({ error: 'Record niet gevonden' })
    return record
  })

  fastify.delete('/kiosk/meetmiddelen/:id/calibrations/:calId', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { calId } = req.params as { id: string; calId: string }
    await fastify.db.delete(calibrationRecords).where(eq(calibrationRecords.id, calId))
    return { ok: true }
  })

  // ── Certificaat upload ─────────────────────────────────────────────────────
  fastify.post('/kiosk/meetmiddelen/:id/calibrations/:calId/certificate', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { calId } = req.params as { id: string; calId: string }
    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'Geen bestand' })
    const ext = path.extname(data.filename).toLowerCase()
    const filename = `mm-cert-${randomUUID()}-${Date.now()}${ext}`
    const dest = `/app/uploads/${filename}`
    await pipeline(data.file, createWriteStream(dest))
    const certificaatUrl = `/uploads/${filename}`
    const [record] = await fastify.db
      .update(calibrationRecords)
      .set({ certificaatUrl, certificaatNaam: data.filename })
      .where(eq(calibrationRecords.id, calId))
      .returning()
    return record
  })

  // ── Interne kalibratie sessies ─────────────────────────────────────────────
  fastify.get('/kiosk/meetmiddelen/:id/internal-sessions', auth, async (req) => {
    const { id } = req.params as { id: string }
    const sessions = await fastify.db
      .select()
      .from(internalCalibrationSessions)
      .where(eq(internalCalibrationSessions.toolId, id))
      .orderBy(desc(internalCalibrationSessions.createdAt))

    const allRows = await fastify.db
      .select()
      .from(calibrationMeasurementRows)

    const rowsBySession: Record<string, typeof allRows> = {}
    for (const r of allRows) {
      if (!rowsBySession[r.sessionId]) rowsBySession[r.sessionId] = []
      rowsBySession[r.sessionId].push(r)
    }

    return sessions.map((s) => ({ ...s, rows: rowsBySession[s.id] ?? [] }))
  })

  fastify.post('/kiosk/meetmiddelen/:id/internal-sessions', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { id } = req.params as { id: string }
    const body = internalSessionSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })
    const [session] = await fastify.db
      .insert(internalCalibrationSessions)
      .values({ ...body.data, toolId: id })
      .returning()
    return { ...session, rows: [] }
  })

  fastify.put('/kiosk/meetmiddelen/:id/internal-sessions/:sessId', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { sessId } = req.params as { id: string; sessId: string }
    const body = internalSessionSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })
    const [session] = await fastify.db
      .update(internalCalibrationSessions)
      .set(body.data)
      .where(eq(internalCalibrationSessions.id, sessId))
      .returning()
    if (!session) return reply.status(404).send({ error: 'Sessie niet gevonden' })
    return session
  })

  fastify.delete('/kiosk/meetmiddelen/:id/internal-sessions/:sessId', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { sessId } = req.params as { id: string; sessId: string }
    await fastify.db.delete(internalCalibrationSessions).where(eq(internalCalibrationSessions.id, sessId))
    return { ok: true }
  })

  // ── Meetrijen ──────────────────────────────────────────────────────────────
  fastify.post('/kiosk/meetmiddelen/:id/internal-sessions/:sessId/rows', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { sessId } = req.params as { id: string; sessId: string }
    const body = measurementRowSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })
    const [row] = await fastify.db
      .insert(calibrationMeasurementRows)
      .values({ ...body.data, sessionId: sessId })
      .returning()
    return row
  })

  fastify.put('/kiosk/meetmiddelen/:id/internal-sessions/:sessId/rows/:rowId', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { rowId } = req.params as { id: string; sessId: string; rowId: string }
    const body = measurementRowSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })
    const [row] = await fastify.db
      .update(calibrationMeasurementRows)
      .set(body.data)
      .where(eq(calibrationMeasurementRows.id, rowId))
      .returning()
    if (!row) return reply.status(404).send({ error: 'Rij niet gevonden' })
    return row
  })

  fastify.delete('/kiosk/meetmiddelen/:id/internal-sessions/:sessId/rows/:rowId', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { rowId } = req.params as { id: string; sessId: string; rowId: string }
    await fastify.db.delete(calibrationMeasurementRows).where(eq(calibrationMeasurementRows.id, rowId))
    return { ok: true }
  })

  // ── Tool documents ─────────────────────────────────────────────────────────
  fastify.get('/kiosk/meetmiddelen/:id/documents', auth, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select()
      .from(toolDocuments)
      .where(eq(toolDocuments.toolId, id))
      .orderBy(desc(toolDocuments.createdAt))
  })

  fastify.post('/kiosk/meetmiddelen/:id/documents', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { id } = req.params as { id: string }
    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'Geen bestand' })
    const ext = path.extname(data.filename).toLowerCase()
    const filename = `mm-doc-${randomUUID()}-${Date.now()}${ext}`
    const dest = `/app/uploads/${filename}`
    await pipeline(data.file, createWriteStream(dest))
    const today = new Date().toISOString().slice(0, 10)
    const [doc] = await fastify.db
      .insert(toolDocuments)
      .values({
        toolId: id,
        documentNaam: data.filename,
        fileUrl: `/uploads/${filename}`,
        datum: today,
      })
      .returning()
    return doc
  })

  fastify.delete('/kiosk/meetmiddelen/:id/documents/:docId', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { docId } = req.params as { id: string; docId: string }
    await fastify.db.delete(toolDocuments).where(eq(toolDocuments.id, docId))
    return { ok: true }
  })
}
