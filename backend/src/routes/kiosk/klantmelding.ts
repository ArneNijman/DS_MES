import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { customerComplaints, customerComplaintDocuments, statusLogs } from '../../db/schema.js'
import { eq, desc, and } from 'drizzle-orm'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { randomUUID } from 'crypto'
import path from 'path'

const CAUSE_CODES = [
  'Boor fout', 'Conditie fout', 'Foute opspanning', 'Freesfout', 'Lasfout',
  'Montage fout', 'Programma fout', 'Gereedschap fout', 'Tekening fout',
  'Productie documentatie', 'Bestel documentatie',
] as const

const FAULT_CODES = [
  'Maat/vorm', 'Porositeit', 'Functionaliteit', 'Beschadiging',
  'Oppervlakteruwheid', 'Visueel', 'Documentatie',
] as const

const klantmeldingSchema = z.object({
  status:                    z.enum(['open', 'in_behandeling', 'gesloten']).default('open'),
  datumMelding:              z.string().optional().nullable(),
  datumAfgesloten:           z.string().optional().nullable(),
  klant:                     z.string().optional().nullable(),
  oorspronkelijkOrdernummer: z.string().optional().nullable(),
  nieuwOrdernummer:          z.string().optional().nullable(),
  contactpersoon:            z.string().optional().nullable(),
  artikel:                   z.string().optional().nullable(),
  emailContactpersoon:       z.string().optional().nullable(),
  oorzaakCode:               z.enum(CAUSE_CODES).optional().nullable(),
  foutCode:                  z.enum(FAULT_CODES).optional().nullable(),
  omschrijving:              z.string().optional().nullable(),
  oplossing:                 z.string().optional().nullable(),
  beslotenDoor:              z.array(z.object({ id: z.string(), name: z.string() })).optional().default([]),
  createdByName:             z.string().optional().nullable(),
  createdById:               z.string().uuid().optional().nullable(),
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

async function nextCtrId(fastify: FastifyInstance): Promise<string> {
  const rows = await fastify.db
    .select({ ctrId: customerComplaints.ctrId })
    .from(customerComplaints)
    .orderBy(desc(customerComplaints.createdAt))
    .limit(100)

  if (!rows.length) return 'CTR_10001'

  const nums = rows
    .map((r) => parseInt(r.ctrId.replace('CTR_', ''), 10))
    .filter((n) => !isNaN(n))
  const max = Math.max(...nums)
  return `CTR_${max + 1}`
}

export async function kioskKlantmeldingRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  fastify.get('/kiosk/klantmelding/next-id', auth, async () => {
    return { ctrId: await nextCtrId(fastify) }
  })

  fastify.get('/kiosk/klantmelding', auth, async () => {
    return fastify.db
      .select()
      .from(customerComplaints)
      .orderBy(desc(customerComplaints.createdAt))
  })

  // GET status log van een klantmelding
  fastify.get('/kiosk/klantmelding/:id/status-log', auth, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select()
      .from(statusLogs)
      .where(and(eq(statusLogs.entityType, 'klantmelding'), eq(statusLogs.entityId, id)))
      .orderBy(desc(statusLogs.createdAt))
  })

  fastify.post('/kiosk/klantmelding', auth, async (req, reply) => {
    const body = klantmeldingSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })

    const employee = (req as { employee?: { employeeId?: string; name?: string } }).employee
    const ctrId = await nextCtrId(fastify)
    const [complaint] = await fastify.db
      .insert(customerComplaints)
      .values({ ...body.data, ctrId })
      .returning()

    await logStatusChange(fastify, 'klantmelding', complaint.id, null, 'open', employee?.name ?? null, employee?.employeeId ?? null)
    return complaint
  })

  fastify.put('/kiosk/klantmelding/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = klantmeldingSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })

    const employee = (req as { employee?: { employeeId?: string; name?: string } }).employee

    const [existing] = await fastify.db
      .select({ status: customerComplaints.status })
      .from(customerComplaints)
      .where(eq(customerComplaints.id, id))
      .limit(1)

    const [complaint] = await fastify.db
      .update(customerComplaints)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(customerComplaints.id, id))
      .returning()

    if (!complaint) return reply.status(404).send({ error: 'Klantmelding niet gevonden' })

    if (existing && body.data.status && existing.status !== body.data.status) {
      await logStatusChange(fastify, 'klantmelding', id, existing.status, body.data.status, employee?.name ?? null, employee?.employeeId ?? null)
    }

    return complaint
  })

  // ── Bijlages ───────────────────────────────────────────────────────────────

  fastify.get('/kiosk/klantmelding/:id/documents', auth, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select()
      .from(customerComplaintDocuments)
      .where(eq(customerComplaintDocuments.ctrId, id))
      .orderBy(desc(customerComplaintDocuments.createdAt))
  })

  fastify.post('/kiosk/klantmelding/:id/documents', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'Geen bestand' })
    const ext = path.extname(data.filename).toLowerCase()
    const filename = `ctr-doc-${randomUUID()}-${Date.now()}${ext}`
    const dest = `/app/uploads/${filename}`
    await pipeline(data.file, createWriteStream(dest))
    const today = new Date().toISOString().slice(0, 10)
    const [doc] = await fastify.db
      .insert(customerComplaintDocuments)
      .values({
        ctrId: id,
        documentNaam: data.filename,
        fileUrl: `/uploads/${filename}`,
        datum: today,
      })
      .returning()
    return doc
  })

  fastify.delete('/kiosk/klantmelding/:id/documents/:docId', auth, async (req, reply) => {
    const { docId } = req.params as { id: string; docId: string }
    await fastify.db.delete(customerComplaintDocuments).where(eq(customerComplaintDocuments.id, docId))
    return { ok: true }
  })

  fastify.delete('/kiosk/klantmelding/:id', auth, async (req, reply) => {
    const PRIVILEGED_ROLES = ['admin', 'quality']
    const userRole = (req as { employee?: { role?: string } }).employee?.role ?? ''
    if (!PRIVILEGED_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: 'Geen rechten om klantmeldingen te verwijderen' })
    }
    const { id } = req.params as { id: string }
    await fastify.db.delete(customerComplaints).where(eq(customerComplaints.id, id))
    return { ok: true }
  })
}
