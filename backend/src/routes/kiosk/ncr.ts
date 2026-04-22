import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ncrRegistrations, ncrAttachments, statusLogs } from '../../db/schema.js'
import { eq, desc, asc, and, inArray } from 'drizzle-orm'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { randomUUID } from 'crypto'
import path from 'path'

const DEPARTMENTS = [
  'CAM', 'Constructie', 'Engineering', 'Kwaliteit', 'Logistiek',
  'Productie engineer', 'Productie manager', 'Verspaning', 'Montage',
  'Extern', 'Sales', 'Inkoop',
] as const

const FAULT_CODES = [
  'Maat/vorm', 'Porositeit', 'Functionaliteit', 'Beschadiging',
  'Oppervlakteruwheid', 'Visueel', 'Documentatie',
] as const

const CAUSE_CODES = [
  'Boor fout', 'Conditie fout', 'Foute opspanning', 'Freesfout', 'Lasfout',
  'Montage fout', 'Programma fout', 'Gereedschap fout', 'Tekening fout',
  'Productie documentatie', 'Bestel documentatie',
] as const

const DISPOSITION_TYPES = [
  'Gebruiken zoals het is (klant besluit)',
  'Repareren (klant besluit)',
  'Herbewerken',
  'Terugsturen',
  'Vernietigen',
] as const

const ncrSchema = z.object({
  productionOrder: z.string().optional().nullable(),
  itemRef: z.string().optional().nullable(),
  itemName: z.string().optional().nullable(),
  productionStep: z.string().optional().nullable(),
  writtenByName: z.string().optional().nullable(),
  writtenByDepartment: z.enum(DEPARTMENTS).optional().nullable(),
  causingDepartment: z.enum(DEPARTMENTS).optional().nullable(),
  faultCode: z.enum(FAULT_CODES).optional().nullable(),
  causeCode: z.enum(CAUSE_CODES).optional().nullable(),
  shortDescription: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  measureRequired: z.boolean().optional().nullable(),
  peEmail: z.string().optional().nullable(),
  solution: z.string().optional().nullable(),
  dispositionType: z.enum(DISPOSITION_TYPES).optional().nullable(),
  resolvedBy: z.string().optional().nullable(),
  closedBy: z.string().optional().nullable(),
  closedAt: z.string().optional().nullable(),
  status: z.enum(['open', 'in_behandeling', 'in_uitvoering', 'gereed', 'gesloten', 'vervallen']).default('open'),
  createdById: z.string().uuid().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
})

async function logStatusChange(
  fastify: FastifyInstance,
  entityType: string,
  entityId: string,
  fromStatus: string | null,
  toStatus: string,
  changedByName: string | null,
  changedById: string | null,
) {
  if (fromStatus === toStatus) return
  await fastify.db.insert(statusLogs).values({ entityType, entityId, fromStatus, toStatus, changedByName, changedById })
}

async function nextNcrId(fastify: FastifyInstance): Promise<string> {
  const rows = await fastify.db
    .select({ ncrId: ncrRegistrations.ncrId })
    .from(ncrRegistrations)
    .orderBy(desc(ncrRegistrations.ncrId))
    .limit(1)
  if (!rows.length) return 'NCR_100001'
  const num = parseInt(rows[0].ncrId.replace('NCR_', ''), 10)
  return `NCR_${num + 1}`
}

export async function kioskNcrRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  // GET volgende NCR ID (preview voor nieuw formulier)
  fastify.get('/kiosk/ncr/next-id', auth, async () => {
    return { ncrId: await nextNcrId(fastify) }
  })

  // GET mijn taken (actieve NCR's toegewezen aan de ingelogde medewerker)
  fastify.get('/kiosk/ncr/my-tasks', auth, async (req) => {
    const userId = (req as { employee?: { employeeId?: string } }).employee?.employeeId ?? ''
    if (!userId) return []
    return fastify.db
      .select()
      .from(ncrRegistrations)
      .where(
        and(
          eq(ncrRegistrations.assignedToId, userId),
          inArray(ncrRegistrations.status, ['open', 'in_behandeling', 'in_uitvoering']),
        ),
      )
      .orderBy(desc(ncrRegistrations.createdAt))
  })

  // GET één NCR op display-ID (bijv. "NCR_100229") — voor auto-fill in preventief
  fastify.get('/kiosk/ncr/by-display-id/:ncrId', auth, async (req, reply) => {
    const { ncrId } = req.params as { ncrId: string }
    const [ncr] = await fastify.db
      .select()
      .from(ncrRegistrations)
      .where(eq(ncrRegistrations.ncrId, ncrId))
      .limit(1)
    if (!ncr) return reply.status(404).send({ error: 'NCR niet gevonden' })
    return ncr
  })

  // GET alle NCR's
  fastify.get('/kiosk/ncr', auth, async () => {
    return fastify.db
      .select()
      .from(ncrRegistrations)
      .orderBy(desc(ncrRegistrations.createdAt))
  })

  // POST aanmaken
  fastify.post('/kiosk/ncr', auth, async (req, reply) => {
    const body = ncrSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })

    const employee = (req as { employee?: { employeeId?: string; name?: string } }).employee
    const ncrId = await nextNcrId(fastify)
    const [ncr] = await fastify.db
      .insert(ncrRegistrations)
      .values({ ...body.data, ncrId })
      .returning()

    await logStatusChange(fastify, 'ncr', ncr.id, null, 'open', employee?.name ?? null, employee?.employeeId ?? null)
    return ncr
  })

  // GET status log van een NCR
  fastify.get('/kiosk/ncr/:id/status-log', auth, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select()
      .from(statusLogs)
      .where(and(eq(statusLogs.entityType, 'ncr'), eq(statusLogs.entityId, id)))
      .orderBy(desc(statusLogs.createdAt))
  })

  // PUT bijwerken
  fastify.put('/kiosk/ncr/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = ncrSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })

    const PRIVILEGED_ROLES = ['admin', 'quality']
    const RESTRICTED_STATUSES = ['vervallen', 'gesloten']
    const LOCKED_STATUSES = ['gesloten']
    const employee = (req as { employee?: { employeeId?: string; name?: string; role?: string } }).employee
    const userRole = employee?.role ?? ''

    // Mag de gebruiker de gevraagde status instellen?
    if (body.data.status && RESTRICTED_STATUSES.includes(body.data.status)) {
      if (!PRIVILEGED_ROLES.includes(userRole)) {
        return reply.status(403).send({ error: 'Alleen Beheerder of Kwaliteit mag deze status instellen' })
      }
    }

    // Is de NCR al afgesloten en mag de gebruiker het überhaupt bewerken?
    const [existing] = await fastify.db
      .select({ status: ncrRegistrations.status })
      .from(ncrRegistrations)
      .where(eq(ncrRegistrations.id, id))
      .limit(1)
    if (existing && LOCKED_STATUSES.includes(existing.status)) {
      if (!PRIVILEGED_ROLES.includes(userRole)) {
        return reply.status(403).send({ error: 'Alleen Beheerder of Kwaliteit mag een afgesloten NCR aanpassen' })
      }
    }

    const [ncr] = await fastify.db
      .update(ncrRegistrations)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(ncrRegistrations.id, id))
      .returning()

    if (!ncr) return reply.status(404).send({ error: 'NCR niet gevonden' })

    if (existing && body.data.status && existing.status !== body.data.status) {
      await logStatusChange(fastify, 'ncr', id, existing.status, body.data.status, employee?.name ?? null, employee?.employeeId ?? null)
    }

    return ncr
  })

  // DELETE verwijderen
  fastify.delete('/kiosk/ncr/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    await fastify.db.delete(ncrRegistrations).where(eq(ncrRegistrations.id, id))
    return { ok: true }
  })

  // ── Bijlages ─────────────────────────────────────────────────────────────

  // GET bijlages van een NCR
  fastify.get('/kiosk/ncr/:id/attachments', auth, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select()
      .from(ncrAttachments)
      .where(eq(ncrAttachments.ncrId, id))
      .orderBy(asc(ncrAttachments.createdAt))
  })

  // POST bijlage uploaden
  fastify.post('/kiosk/ncr/:id/attachments', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'Geen bestand' })

    const ext = path.extname(data.filename)
    const dest = `/app/uploads/ncr-att-${randomUUID()}${ext}`
    await pipeline(data.file, createWriteStream(dest))

    const [att] = await fastify.db
      .insert(ncrAttachments)
      .values({
        ncrId: id,
        fileUrl: `/uploads/${path.basename(dest)}`,
        fileName: data.filename,
        mimeType: data.mimetype,
      })
      .returning()

    return att
  })

  // DELETE bijlage verwijderen
  fastify.delete('/kiosk/ncr-attachments/:id', auth, async (req) => {
    const { id } = req.params as { id: string }
    await fastify.db.delete(ncrAttachments).where(eq(ncrAttachments.id, id))
    return { ok: true }
  })
}
