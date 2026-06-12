import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  measuringTools, calibrationRecords, toolDocuments, machines,
  internalCalibrationSessions, calibrationMeasurementRows, employees,
  kalibratieVerzendingen, kalibratieVerzendingItems,
} from '../../db/schema.js'
import { eq, desc, inArray } from 'drizzle-orm'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { randomUUID } from 'crypto'
import path from 'path'
import { genereerKalibratieExportPdf } from '../../lib/pdf-generator.js'

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
  zoek:               z.boolean().optional().nullable(),
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

  // ── Kalibratie export PDF ─────────────────────────────────────────────────

  fastify.post('/kiosk/meetmiddelen/export-pdf', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return

    const MONTHS: Record<string, number> = { jaarlijks: 12, halfjaarlijks: 6, kwartaal: 3 }
    const body = req.body as { filter?: string; locatie?: string; toolIds?: string[] }
    const filter  = body.filter ?? 'beide'   // 'verlopen' | 'kritisch' | 'beide'
    const locatie = body.locatie?.trim() || null
    const toolIds = Array.isArray(body.toolIds) && body.toolIds.length ? body.toolIds : null

    // Haal alle externe kalibratie tools op
    const allTools = await fastify.db.select().from(measuringTools)
      .where(eq(measuringTools.externeKalibratie, true))

    const [allCals, allSessions] = await Promise.all([
      fastify.db.select().from(calibrationRecords),
      fastify.db.select().from(internalCalibrationSessions),
    ])

    const lastCalByTool: Record<string, string | null> = {}
    for (const c of allCals) {
      const e = lastCalByTool[c.toolId]
      if (!e || (c.datum && c.datum > e)) lastCalByTool[c.toolId] = c.datum ?? null
    }
    for (const s of allSessions) {
      const e = lastCalByTool[s.toolId]
      if (!e || (s.voltooiingsdatum && s.voltooiingsdatum > e)) lastCalByTool[s.toolId] = s.voltooiingsdatum ?? null
    }

    const now = Date.now()
    const regels = []

    for (const t of allTools) {
      if (!t.actief) continue
      if (locatie && t.locatie !== locatie) continue
      if (toolIds && !toolIds.includes(t.id)) continue
      if (!t.interval || t.interval === 'geen') continue

      const m       = MONTHS[t.interval] ?? 12
      const lastDat = lastCalByTool[t.id] ?? null
      let daysLeft: number
      let vervalStr = '—'

      if (!lastDat) {
        daysLeft = -1
      } else {
        const next = new Date(lastDat)
        next.setMonth(next.getMonth() + m)
        daysLeft = Math.floor((next.getTime() - now) / 86400000)
        vervalStr = next.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
      }

      const includeVerlopen = filter === 'verlopen' || filter === 'beide'
      const includeKritisch = filter === 'kritisch' || filter === 'beide'

      if (daysLeft < 0 && !includeVerlopen) continue
      if (daysLeft >= 0 && daysLeft <= 90 && !includeKritisch) continue
      if (daysLeft > 90 && !toolIds) continue  // alleen meenemen als handmatig geselecteerd

      regels.push({
        displayId:   t.voorraadId ?? t.toolId,
        artikelnaam: t.artikelnaam ?? '—',
        merk:        t.merk ?? '—',
        afmeting:    t.afmeting ?? '—',
        serienummer: t.serieSuffix ?? '—',
        vervaldatum: vervalStr,
      })
    }

    // Sorteer: geen vervaldatum eerst, daarna oudste vervaldatum eerst
    regels.sort((a, b) => {
      if (a.vervaldatum === '—' && b.vervaldatum !== '—') return -1
      if (a.vervaldatum !== '—' && b.vervaldatum === '—') return 1
      return a.vervaldatum.localeCompare(b.vervaldatum)
    })

    const filterLabel = filter === 'verlopen' ? 'Verlopen kalibraties'
                      : filter === 'kritisch' ? 'Kritische kalibraties (< 90 dagen)'
                      : 'Verlopen + kritische kalibraties'
    const titel  = `Kalibratie-exportlijst — ${filterLabel}${locatie ? ` — ${locatie}` : ''}`
    const datum  = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' })
    const buffer = await genereerKalibratieExportPdf(titel, datum, regels)

    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="kalibratie-export-${new Date().toISOString().slice(0,10)}.pdf"`)
    return reply.send(buffer)
  })

  // ── Kalibratie verzendingen CRUD ──────────────────────────────────────────

  fastify.get('/kiosk/meetmiddelen/verzendingen', auth, async () => {
    const verzendingen = await fastify.db
      .select().from(kalibratieVerzendingen)
      .orderBy(desc(kalibratieVerzendingen.createdAt))
    const items = await fastify.db.select().from(kalibratieVerzendingItems)
    return verzendingen.map(v => ({
      ...v,
      aantalItems: items.filter(i => i.verzendingId === v.id).length,
    }))
  })

  fastify.post('/kiosk/meetmiddelen/verzendingen', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const employee = (req as any).employee as { id: string; name: string }
    const { naam, labNaam, toolIds } = req.body as { naam: string; labNaam?: string; toolIds: string[] }
    if (!naam || !Array.isArray(toolIds) || toolIds.length === 0)
      return reply.status(400).send({ error: 'Naam en minimaal 1 meetmiddel zijn verplicht' })

    const [v] = await fastify.db.insert(kalibratieVerzendingen)
      .values({ naam, labNaam: labNaam || null, aangemaaktDoorId: employee.id, aangemaaktDoorNaam: employee.name })
      .returning()
    await fastify.db.insert(kalibratieVerzendingItems)
      .values(toolIds.map(toolId => ({ verzendingId: v.id, toolId })))
    return v
  })

  fastify.get('/kiosk/meetmiddelen/verzendingen/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const [v] = await fastify.db.select().from(kalibratieVerzendingen).where(eq(kalibratieVerzendingen.id, id))
    if (!v) return reply.status(404).send({ error: 'Niet gevonden' })
    const items = await fastify.db.select({ toolId: kalibratieVerzendingItems.toolId })
      .from(kalibratieVerzendingItems).where(eq(kalibratieVerzendingItems.verzendingId, id))
    const toolIds = items.map(i => i.toolId)
    const tools = toolIds.length
      ? await fastify.db.select().from(measuringTools).where(inArray(measuringTools.id, toolIds))
      : []
    return { ...v, tools }
  })

  fastify.put('/kiosk/meetmiddelen/verzendingen/:id', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { id } = req.params as { id: string }
    const { status, datumWeggestuurd, datumTerug, labNaam } = req.body as {
      status?: string; datumWeggestuurd?: string; datumTerug?: string; labNaam?: string
    }
    const [v] = await fastify.db.update(kalibratieVerzendingen)
      .set({ status: status ?? undefined, datumWeggestuurd: datumWeggestuurd ?? undefined, datumTerug: datumTerug ?? undefined, labNaam: labNaam ?? undefined })
      .where(eq(kalibratieVerzendingen.id, id))
      .returning()
    if (!v) return reply.status(404).send({ error: 'Niet gevonden' })
    return v
  })

  fastify.delete('/kiosk/meetmiddelen/verzendingen/:id', auth, async (req, reply) => {
    if (!requirePrivileged(req, reply)) return
    const { id } = req.params as { id: string }
    await fastify.db.delete(kalibratieVerzendingen).where(eq(kalibratieVerzendingen.id, id))
    return { ok: true }
  })

  fastify.post('/kiosk/meetmiddelen/verzendingen/:id/pdf', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const MONTHS: Record<string, number> = { jaarlijks: 12, halfjaarlijks: 6, kwartaal: 3 }
    const [v] = await fastify.db.select().from(kalibratieVerzendingen).where(eq(kalibratieVerzendingen.id, id))
    if (!v) return reply.status(404).send({ error: 'Niet gevonden' })
    const items = await fastify.db.select({ toolId: kalibratieVerzendingItems.toolId })
      .from(kalibratieVerzendingItems).where(eq(kalibratieVerzendingItems.verzendingId, id))
    const toolIds = items.map(i => i.toolId)
    const tools = toolIds.length ? await fastify.db.select().from(measuringTools).where(inArray(measuringTools.id, toolIds)) : []

    const [allCals, allSessions] = await Promise.all([
      fastify.db.select().from(calibrationRecords),
      fastify.db.select().from(internalCalibrationSessions),
    ])
    const lastCalByTool: Record<string, string | null> = {}
    for (const c of allCals) { const e = lastCalByTool[c.toolId]; if (!e || (c.datum && c.datum > e)) lastCalByTool[c.toolId] = c.datum ?? null }
    for (const s of allSessions) { const e = lastCalByTool[s.toolId]; if (!e || (s.voltooiingsdatum && s.voltooiingsdatum > e)) lastCalByTool[s.toolId] = s.voltooiingsdatum ?? null }

    const regels = tools.map(t => {
      const m = MONTHS[t.interval ?? ''] ?? 12
      const lastDat = lastCalByTool[t.id] ?? null
      let vervalStr = '—'
      if (lastDat) {
        const next = new Date(lastDat); next.setMonth(next.getMonth() + m)
        vervalStr = next.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
      }
      return { displayId: t.voorraadId ?? t.toolId, artikelnaam: t.artikelnaam ?? '—', merk: t.merk ?? '—', afmeting: t.afmeting ?? '—', serienummer: t.serieSuffix ?? '—', vervaldatum: vervalStr }
    })

    const datum  = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' })
    const buffer = await genereerKalibratieExportPdf(`Verzending: ${v.naam}${v.labNaam ? ` — ${v.labNaam}` : ''}`, datum, regels)
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="verzending-${v.naam.replace(/[^a-z0-9]/gi, '-')}.pdf"`)
    return reply.send(buffer)
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
