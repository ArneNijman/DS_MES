import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { machines, maintenanceTasks, breakdowns, employees, maintenanceLogs, maintenanceAttachments, breakdownAttachments, machineServiceVisits, machineServiceContracts, machineDocuments, machineInvoices } from '../../db/schema.js'
import { eq, asc, desc } from 'drizzle-orm'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { randomUUID } from 'crypto'
import path from 'path'

const CATEGORIES = [
  'Freesmachine',
  'Draaibank',
  'Zaagmachine',
  'Lasapparaat',
  'Boormachine',
  'Ponsknipmachine',
  'Kantpers',
  'Slijpmachine',
  'Overig',
] as const

// Lege strings worden null — PostgreSQL accepteert "" niet als numeric waarde
const numericStr = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().nullable().optional(),
)

const machineSchema = z.object({
  machineId: z.string().optional().nullable(),
  name: z.string().min(1),
  category: z.string().min(1),
  manufacturer: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  yearOfPurchase: z.number().int().optional().nullable(),
  weightKg: numericStr,
  notes: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  electricKva: numericStr,
  electricKw: numericStr,
  electricAmpere: numericStr,
  electricFuse: z.string().optional().nullable(),
  electricCableLength: numericStr,
  electricWireDiameter: z.string().optional().nullable(),
  cncController: z.string().optional().nullable(),
  cncIpAddress: z.string().optional().nullable(),
  cncCamName: z.string().optional().nullable(),
  cncMaxTools: z.number().int().optional().nullable(),
  cncMaxLength: numericStr,
  cncMaxDiameter: numericStr,
  cncSpindleInterface: z.string().optional().nullable(),
  cncNcVersion: z.string().optional().nullable(),
  cncPlcVersion: z.string().optional().nullable(),
})

const maintenanceSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.enum(['gepland', 'bezig', 'gereed', 'uitgesteld']).default('gepland'),
  priority: z.enum(['laag', 'normaal', 'hoog', 'kritiek']).default('normaal'),
  scheduledDate: z.string().optional().nullable(),
  completedDate: z.string().optional().nullable(),
  interval: z.enum(['wekelijks', 'maandelijks', 'kwartaal', 'halfjaar', 'jaarlijks']).optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
})

const breakdownSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.enum(['gemeld', 'in_behandeling', 'opgelost']).default('gemeld'),
  priority: z.enum(['laag', 'normaal', 'hoog', 'kritiek']).default('normaal'),
  reportedById: z.string().uuid().optional().nullable(),
  resolvedAt: z.string().optional().nullable(),
  resolution: z.string().optional().nullable(),
  resolvedByType: z.enum(['intern', 'extern']).optional().nullable(),
  resolvedByName: z.string().optional().nullable(),
  werkbonUrl: z.string().optional().nullable(),
  werkbonFileName: z.string().optional().nullable(),
})

const serviceVisitSchema = z.object({
  visitDate: z.string().min(1),
  serviceType: z.enum(['intern', 'extern']),
  performedBy: z.string().min(1),
  description: z.string().optional().nullable(),
})

const serviceContractSchema = z.object({
  contractNumber: z.string().optional().nullable(),
  supplier: z.string().min(1),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  costPerYear: numericStr,
  description: z.string().optional().nullable(),
  fileUrl: z.string().optional().nullable(),
  fileName: z.string().optional().nullable(),
})

const machineDocumentSchema = z.object({
  documentType: z.enum(['handleiding', 'certificaat', 'tekening', 'schema', 'overig']),
  title: z.string().min(1),
  fileUrl: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().optional().nullable(),
})

const maintenanceLogSchema = z.object({
  type: z.enum(['spindel_uren', 'spindel_koeling', 'las_uren', 'centrale_smering', 'spindel_smering', 'koelwater', 'hydroliek_32', 'meetdata']),
  registeredByName: z.string().min(1),
  registeredById: z.string().optional().nullable(),
  year: z.number().int(),
  weekNumber: z.number().int().min(1).max(53),
  spindleHours: z.preprocess(v => v === '' ? null : v, z.string().nullable().optional()),
  lasValueA: z.string().optional().nullable(),
  lasValueB: z.string().optional().nullable(),
  bijgevuld: z.boolean().optional().nullable(),
  vervangen: z.boolean().optional().nullable(),
  afvoerGeleegd: z.boolean().optional().nullable(),
  percentage: z.string().optional().nullable(),
  fileUrl: z.string().optional().nullable(),
  fileName: z.string().optional().nullable(),
})

export async function adminMachineRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAdmin] }
  const authRead = { preHandler: [fastify.requireAuth] }

  // ── Machines ────────────────────────────────────────────────

  fastify.get('/admin/machines', authRead, async () => {
    return fastify.db
      .select({
        id: machines.id,
        machineId: machines.machineId,
        name: machines.name,
        category: machines.category,
        manufacturer: machines.manufacturer,
        isActive: machines.isActive,
        photoUrl: machines.photoUrl,
        createdAt: machines.createdAt,
      })
      .from(machines)
      .orderBy(asc(machines.name))
  })

  fastify.get('/admin/machines/categories', authRead, async () => {
    return CATEGORIES
  })

  fastify.post('/admin/machines/photo-upload', auth, async (req, reply) => {
    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'Geen bestand' })
    const ext = path.extname(data.filename)
    const dest = `/app/uploads/machine-photo-${randomUUID()}${ext}`
    await pipeline(data.file, createWriteStream(dest))
    return { photoUrl: `/uploads/${path.basename(dest)}` }
  })

  fastify.get('/admin/machines/:id', authRead, async (req, reply) => {
    const { id } = req.params as { id: string }
    const rows = await fastify.db
      .select()
      .from(machines)
      .where(eq(machines.id, id))
      .limit(1)
    if (!rows.length) return reply.status(404).send({ error: 'Machine niet gevonden' })
    return rows[0]
  })

  fastify.post('/admin/machines', auth, async (req, reply) => {
    const body = machineSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })

    const [machine] = await fastify.db
      .insert(machines)
      .values(body.data)
      .returning()

    return machine
  })

  fastify.put('/admin/machines/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = machineSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })

    const [machine] = await fastify.db
      .update(machines)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(machines.id, id))
      .returning()

    if (!machine) return reply.status(404).send({ error: 'Machine niet gevonden' })
    return machine
  })

  fastify.patch('/admin/machines/:id/status', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { isActive } = req.body as { isActive: boolean }

    await fastify.db
      .update(machines)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(machines.id, id))

    return { ok: true }
  })

  fastify.delete('/admin/machines/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    await fastify.db.delete(machines).where(eq(machines.id, id))
    return { ok: true }
  })

  // ── Onderhoud ───────────────────────────────────────────────

  // Alle onderhoudstaken (globaal overzicht)
  fastify.get('/admin/maintenance', auth, async () => {
    return fastify.db
      .select({
        id: maintenanceTasks.id,
        machineId: maintenanceTasks.machineId,
        machineName: machines.name,
        machineCategory: machines.category,
        title: maintenanceTasks.title,
        description: maintenanceTasks.description,
        status: maintenanceTasks.status,
        priority: maintenanceTasks.priority,
        scheduledDate: maintenanceTasks.scheduledDate,
        completedDate: maintenanceTasks.completedDate,
        assignedToId: maintenanceTasks.assignedToId,
        assignedToName: employees.name,
        createdAt: maintenanceTasks.createdAt,
      })
      .from(maintenanceTasks)
      .leftJoin(machines, eq(maintenanceTasks.machineId, machines.id))
      .leftJoin(employees, eq(maintenanceTasks.assignedToId, employees.id))
      .orderBy(desc(maintenanceTasks.createdAt))
  })

  // Onderhoud per machine
  fastify.get('/admin/machines/:id/maintenance', auth, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select({
        id: maintenanceTasks.id,
        machineId: maintenanceTasks.machineId,
        title: maintenanceTasks.title,
        description: maintenanceTasks.description,
        status: maintenanceTasks.status,
        priority: maintenanceTasks.priority,
        scheduledDate: maintenanceTasks.scheduledDate,
        completedDate: maintenanceTasks.completedDate,
        assignedToId: maintenanceTasks.assignedToId,
        assignedToName: employees.name,
        createdAt: maintenanceTasks.createdAt,
      })
      .from(maintenanceTasks)
      .leftJoin(employees, eq(maintenanceTasks.assignedToId, employees.id))
      .where(eq(maintenanceTasks.machineId, id))
      .orderBy(desc(maintenanceTasks.createdAt))
  })

  fastify.post('/admin/machines/:id/maintenance', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = maintenanceSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })

    const [task] = await fastify.db
      .insert(maintenanceTasks)
      .values({ ...body.data, machineId: id })
      .returning()

    return task
  })

  fastify.put('/admin/maintenance/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = maintenanceSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })

    const [task] = await fastify.db
      .update(maintenanceTasks)
      .set(body.data)
      .where(eq(maintenanceTasks.id, id))
      .returning()

    if (!task) return reply.status(404).send({ error: 'Taak niet gevonden' })
    return task
  })

  fastify.delete('/admin/maintenance/:id', auth, async (req) => {
    const { id } = req.params as { id: string }
    await fastify.db.delete(maintenanceTasks).where(eq(maintenanceTasks.id, id))
    return { ok: true }
  })

  // ── Storingen ───────────────────────────────────────────────

  // Alle storingen (globaal overzicht)
  fastify.get('/admin/breakdowns', auth, async () => {
    return fastify.db
      .select({
        id: breakdowns.id,
        machineId: breakdowns.machineId,
        machineName: machines.name,
        machineCategory: machines.category,
        title: breakdowns.title,
        description: breakdowns.description,
        status: breakdowns.status,
        priority: breakdowns.priority,
        reportedAt: breakdowns.reportedAt,
        reportedById: breakdowns.reportedById,
        reportedByName: employees.name,
        resolvedAt: breakdowns.resolvedAt,
        resolution: breakdowns.resolution,
        createdAt: breakdowns.createdAt,
      })
      .from(breakdowns)
      .leftJoin(machines, eq(breakdowns.machineId, machines.id))
      .leftJoin(employees, eq(breakdowns.reportedById, employees.id))
      .orderBy(desc(breakdowns.reportedAt))
  })

  // Storingen per machine
  fastify.get('/admin/machines/:id/breakdowns', auth, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select({
        id: breakdowns.id,
        machineId: breakdowns.machineId,
        title: breakdowns.title,
        description: breakdowns.description,
        status: breakdowns.status,
        priority: breakdowns.priority,
        reportedAt: breakdowns.reportedAt,
        reportedById: breakdowns.reportedById,
        reportedByName: employees.name,
        resolvedAt: breakdowns.resolvedAt,
        resolution: breakdowns.resolution,
        createdAt: breakdowns.createdAt,
      })
      .from(breakdowns)
      .leftJoin(employees, eq(breakdowns.reportedById, employees.id))
      .where(eq(breakdowns.machineId, id))
      .orderBy(desc(breakdowns.reportedAt))
  })

  fastify.post('/admin/machines/:id/breakdowns', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = breakdownSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })

    const { resolvedAt, ...breakdownData } = body.data
    const [breakdown] = await fastify.db
      .insert(breakdowns)
      .values({
        ...breakdownData,
        machineId: id,
        ...(resolvedAt != null ? { resolvedAt: new Date(resolvedAt) } : {}),
      })
      .returning()

    return breakdown
  })

  fastify.put('/admin/breakdowns/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = breakdownSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })

    const { resolvedAt: resolvedAtStr, ...breakdownUpdateData } = body.data
    const [breakdown] = await fastify.db
      .update(breakdowns)
      .set({
        ...breakdownUpdateData,
        ...(resolvedAtStr != null ? { resolvedAt: new Date(resolvedAtStr) } : {}),
      })
      .where(eq(breakdowns.id, id))
      .returning()

    if (!breakdown) return reply.status(404).send({ error: 'Storing niet gevonden' })
    return breakdown
  })

  fastify.delete('/admin/breakdowns/:id', auth, async (req) => {
    const { id } = req.params as { id: string }
    await fastify.db.delete(breakdowns).where(eq(breakdowns.id, id))
    return { ok: true }
  })

  // ── Specifieke onderhoud logs (gekoppeld aan taak) ─────────────────────────

  const authEmployee = { preHandler: [fastify.requireAuth] }

  // Logs ophalen voor een specifieke onderhoudstaak
  fastify.get('/admin/maintenance/:id/logs', auth, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select()
      .from(maintenanceLogs)
      .where(eq(maintenanceLogs.maintenanceTaskId, id))
      .orderBy(desc(maintenanceLogs.createdAt))
  })

  // Nieuwe log aanmaken voor een specifieke taak
  fastify.post('/admin/maintenance/:id/logs', authEmployee, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = maintenanceLogSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })
    const [log] = await fastify.db
      .insert(maintenanceLogs)
      .values({ ...body.data, maintenanceTaskId: id })
      .returning()
    return log
  })

  // Log bewerken
  fastify.put('/admin/maintenance-logs/:id', authEmployee, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = maintenanceLogSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })
    const [log] = await fastify.db
      .update(maintenanceLogs)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(maintenanceLogs.id, id))
      .returning()
    if (!log) return reply.status(404).send({ error: 'Log niet gevonden' })
    return log
  })

  // Log verwijderen
  fastify.delete('/admin/maintenance-logs/:id', authEmployee, async (req) => {
    const { id } = req.params as { id: string }
    await fastify.db.delete(maintenanceLogs).where(eq(maintenanceLogs.id, id))
    return { ok: true }
  })

  // Bestand uploaden voor meetdata
  fastify.post('/admin/maintenance-logs/upload', authEmployee, async (req, reply) => {
    const file = await req.file()
    if (!file) return reply.status(400).send({ error: 'Geen bestand' })
    const ext = path.extname(file.filename).toLowerCase()
    const filename = `ml-${randomUUID()}-${Date.now()}${ext}`
    const dest = `/app/uploads/${filename}`
    await pipeline(file.file, createWriteStream(dest))
    return { fileUrl: `/uploads/${filename}`, fileName: file.filename }
  })

  // ── Bijlagen per onderhoudstaak ─────────────────────────────────────────

  // Bijlagen ophalen
  fastify.get('/admin/maintenance/:id/attachments', authEmployee, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select()
      .from(maintenanceAttachments)
      .where(eq(maintenanceAttachments.maintenanceTaskId, id))
      .orderBy(asc(maintenanceAttachments.createdAt))
  })

  // Bijlage uploaden en aanmaken
  fastify.post('/admin/maintenance/:id/attachments', authEmployee, async (req, reply) => {
    const { id } = req.params as { id: string }
    const file = await req.file()
    if (!file) return reply.status(400).send({ error: 'Geen bestand' })
    const ext = path.extname(file.filename).toLowerCase()
    const filename = `att-${randomUUID()}-${Date.now()}${ext}`
    const dest = `/app/uploads/${filename}`
    await pipeline(file.file, createWriteStream(dest))
    const [attachment] = await fastify.db
      .insert(maintenanceAttachments)
      .values({
        maintenanceTaskId: id,
        fileUrl: `/uploads/${filename}`,
        fileName: file.filename,
        mimeType: file.mimetype,
      })
      .returning()
    return attachment
  })

  // Bijlage verwijderen
  fastify.delete('/admin/maintenance-attachments/:id', authEmployee, async (req) => {
    const { id } = req.params as { id: string }
    await fastify.db.delete(maintenanceAttachments).where(eq(maintenanceAttachments.id, id))
    return { ok: true }
  })

  // ── Bijlagen per storing ────────────────────────────────────────────────

  fastify.get('/admin/breakdowns/:id/attachments', authEmployee, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select()
      .from(breakdownAttachments)
      .where(eq(breakdownAttachments.breakdownId, id))
      .orderBy(asc(breakdownAttachments.createdAt))
  })

  fastify.post('/admin/breakdowns/:id/attachments', authEmployee, async (req, reply) => {
    const { id } = req.params as { id: string }
    const file = await req.file()
    if (!file) return reply.status(400).send({ error: 'Geen bestand' })
    const ext = path.extname(file.filename).toLowerCase()
    const filename = `bd-att-${randomUUID()}-${Date.now()}${ext}`
    const dest = `/app/uploads/${filename}`
    await pipeline(file.file, createWriteStream(dest))
    const [attachment] = await fastify.db
      .insert(breakdownAttachments)
      .values({ breakdownId: id, fileUrl: `/uploads/${filename}`, fileName: file.filename, mimeType: file.mimetype })
      .returning()
    return attachment
  })

  fastify.delete('/admin/breakdown-attachments/:id', authEmployee, async (req) => {
    const { id } = req.params as { id: string }
    await fastify.db.delete(breakdownAttachments).where(eq(breakdownAttachments.id, id))
    return { ok: true }
  })

  // Werkbon uploaden voor storing
  fastify.post('/admin/breakdowns/werkbon-upload', authEmployee, async (req, reply) => {
    const file = await req.file()
    if (!file) return reply.status(400).send({ error: 'Geen bestand' })
    const ext = path.extname(file.filename).toLowerCase()
    const filename = `bd-wb-${randomUUID()}-${Date.now()}${ext}`
    const dest = `/app/uploads/${filename}`
    await pipeline(file.file, createWriteStream(dest))
    return { fileUrl: `/uploads/${filename}`, fileName: file.filename }
  })

  // ── Service bezoeken ────────────────────────────────────────────────────

  fastify.get('/admin/machines/:id/service-visits', authEmployee, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select()
      .from(machineServiceVisits)
      .where(eq(machineServiceVisits.machineId, id))
      .orderBy(desc(machineServiceVisits.visitDate))
  })

  fastify.post('/admin/machines/:id/service-visits', authEmployee, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = serviceVisitSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })
    const [visit] = await fastify.db
      .insert(machineServiceVisits)
      .values({ ...body.data, machineId: id })
      .returning()
    return visit
  })

  fastify.put('/admin/service-visits/:id', authEmployee, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = serviceVisitSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })
    const [visit] = await fastify.db
      .update(machineServiceVisits)
      .set(body.data)
      .where(eq(machineServiceVisits.id, id))
      .returning()
    if (!visit) return reply.status(404).send({ error: 'Bezoek niet gevonden' })
    return visit
  })

  fastify.delete('/admin/service-visits/:id', authEmployee, async (req) => {
    const { id } = req.params as { id: string }
    await fastify.db.delete(machineServiceVisits).where(eq(machineServiceVisits.id, id))
    return { ok: true }
  })

  // ── Service contracten ──────────────────────────────────────────────────

  fastify.get('/admin/machines/:id/service-contracts', authEmployee, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select()
      .from(machineServiceContracts)
      .where(eq(machineServiceContracts.machineId, id))
      .orderBy(desc(machineServiceContracts.createdAt))
  })

  fastify.post('/admin/machines/:id/service-contracts', authEmployee, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = serviceContractSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })
    const [contract] = await fastify.db
      .insert(machineServiceContracts)
      .values({ ...body.data, machineId: id })
      .returning()
    return contract
  })

  fastify.put('/admin/service-contracts/:id', authEmployee, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = serviceContractSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })
    const [contract] = await fastify.db
      .update(machineServiceContracts)
      .set(body.data)
      .where(eq(machineServiceContracts.id, id))
      .returning()
    if (!contract) return reply.status(404).send({ error: 'Contract niet gevonden' })
    return contract
  })

  fastify.delete('/admin/service-contracts/:id', authEmployee, async (req) => {
    const { id } = req.params as { id: string }
    await fastify.db.delete(machineServiceContracts).where(eq(machineServiceContracts.id, id))
    return { ok: true }
  })

  // Contract bestand uploaden
  fastify.post('/admin/service-contracts/upload', authEmployee, async (req, reply) => {
    const file = await req.file()
    if (!file) return reply.status(400).send({ error: 'Geen bestand' })
    const ext = path.extname(file.filename).toLowerCase()
    const filename = `sc-${randomUUID()}-${Date.now()}${ext}`
    const dest = `/app/uploads/${filename}`
    await pipeline(file.file, createWriteStream(dest))
    return { fileUrl: `/uploads/${filename}`, fileName: file.filename }
  })

  // ── Machine documenten ──────────────────────────────────────────────────

  fastify.get('/admin/machines/:id/documents', authEmployee, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select()
      .from(machineDocuments)
      .where(eq(machineDocuments.machineId, id))
      .orderBy(asc(machineDocuments.createdAt))
  })

  fastify.post('/admin/machines/:id/documents', authEmployee, async (req, reply) => {
    const { id } = req.params as { id: string }
    const parts = req.parts()
    let fileUrl = '', fileName = '', mimeType = '', title = '', documentType = ''
    for await (const part of parts) {
      if (part.type === 'file') {
        const ext = path.extname(part.filename).toLowerCase()
        const name = `doc-${randomUUID()}-${Date.now()}${ext}`
        const dest = `/app/uploads/${name}`
        await pipeline(part.file, createWriteStream(dest))
        fileUrl = `/uploads/${name}`
        fileName = part.filename
        mimeType = part.mimetype
      } else {
        if (part.fieldname === 'title') title = part.value as string
        if (part.fieldname === 'documentType') documentType = part.value as string
      }
    }
    if (!fileUrl || !title || !documentType) return reply.status(400).send({ error: 'Ongeldige gegevens' })
    const parsed = machineDocumentSchema.safeParse({ documentType, title, fileUrl, fileName, mimeType })
    if (!parsed.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })
    const [doc] = await fastify.db
      .insert(machineDocuments)
      .values({ ...parsed.data, machineId: id })
      .returning()
    return doc
  })

  fastify.delete('/admin/machine-documents/:id', authEmployee, async (req) => {
    const { id } = req.params as { id: string }
    await fastify.db.delete(machineDocuments).where(eq(machineDocuments.id, id))
    return { ok: true }
  })

  // ── Machine facturen ────────────────────────────────────────────────────

  fastify.get('/admin/machines/:id/invoices', authEmployee, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select()
      .from(machineInvoices)
      .where(eq(machineInvoices.machineId, id))
      .orderBy(desc(machineInvoices.createdAt))
  })

  fastify.post('/admin/machines/:id/invoices', authEmployee, async (req, reply) => {
    const { id } = req.params as { id: string }
    const file = await req.file()
    if (!file) return reply.status(400).send({ error: 'Geen bestand' })
    const ext = path.extname(file.filename).toLowerCase()
    const filename = `inv-${randomUUID()}-${Date.now()}${ext}`
    const dest = `/app/uploads/${filename}`
    await pipeline(file.file, createWriteStream(dest))
    const [invoice] = await fastify.db
      .insert(machineInvoices)
      .values({ machineId: id, fileUrl: `/uploads/${filename}`, fileName: file.filename })
      .returning()
    return invoice
  })

  fastify.delete('/admin/machine-invoices/:id', authEmployee, async (req) => {
    const { id } = req.params as { id: string }
    await fastify.db.delete(machineInvoices).where(eq(machineInvoices.id, id))
    return { ok: true }
  })
}
