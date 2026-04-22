import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { preventiveActions, statusLogs } from '../../db/schema.js'
import { eq, desc, and } from 'drizzle-orm'

const preventiveSchema = z.object({
  ncrId:                z.string().optional().nullable(),
  status:               z.enum(['open', 'in_behandeling', 'gesloten']).default('open'),
  assignedToId:         z.string().uuid().optional().nullable(),
  assignedToName:       z.string().optional().nullable(),
  datum:                z.string().optional().nullable(),
  completedAt:          z.string().optional().nullable(),
  description:          z.string().optional().nullable(),
  resultaat:            z.string().optional().nullable(),
  productionOrder:      z.string().optional().nullable(),
  itemRef:              z.string().optional().nullable(),
  itemName:             z.string().optional().nullable(),
  createdByName:        z.string().optional().nullable(),
  stilstandRegistreren: z.boolean().optional().nullable(),
  createdById:          z.string().uuid().optional().nullable(),
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

async function nextPrevId(fastify: FastifyInstance): Promise<string> {
  const rows = await fastify.db
    .select({ prevId: preventiveActions.prevId })
    .from(preventiveActions)
    .orderBy(desc(preventiveActions.createdAt))
    .limit(100)

  if (!rows.length) return 'PCM_1'

  const nums = rows
    .map((r) => parseInt(r.prevId.replace('PCM_', ''), 10))
    .filter((n) => !isNaN(n))
  const max = Math.max(...nums)
  return `PCM_${max + 1}`
}

export async function kioskPreventiefRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  // GET volgend Prev-ID (voor nieuw formulier)
  fastify.get('/kiosk/preventief/next-id', auth, async () => {
    return { prevId: await nextPrevId(fastify) }
  })

  // GET alle preventieve acties
  fastify.get('/kiosk/preventief', auth, async () => {
    return fastify.db
      .select()
      .from(preventiveActions)
      .orderBy(desc(preventiveActions.createdAt))
  })

  // GET status log van een preventieve actie
  fastify.get('/kiosk/preventief/:id/status-log', auth, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select()
      .from(statusLogs)
      .where(and(eq(statusLogs.entityType, 'preventief'), eq(statusLogs.entityId, id)))
      .orderBy(desc(statusLogs.createdAt))
  })

  // POST aanmaken
  fastify.post('/kiosk/preventief', auth, async (req, reply) => {
    const body = preventiveSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })

    const employee = (req as { employee?: { employeeId?: string; name?: string } }).employee
    const prevId = await nextPrevId(fastify)
    const [action] = await fastify.db
      .insert(preventiveActions)
      .values({ ...body.data, prevId, stilstandRegistreren: body.data.stilstandRegistreren ?? false })
      .returning()

    await logStatusChange(fastify, 'preventief', action.id, null, 'open', employee?.name ?? null, employee?.employeeId ?? null)
    return action
  })

  // PUT bijwerken
  fastify.put('/kiosk/preventief/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = preventiveSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })

    const employee = (req as { employee?: { employeeId?: string; name?: string } }).employee

    const [existing] = await fastify.db
      .select({ status: preventiveActions.status })
      .from(preventiveActions)
      .where(eq(preventiveActions.id, id))
      .limit(1)

    const [action] = await fastify.db
      .update(preventiveActions)
      .set({ ...body.data, stilstandRegistreren: body.data.stilstandRegistreren ?? false, updatedAt: new Date() })
      .where(eq(preventiveActions.id, id))
      .returning()

    if (!action) return reply.status(404).send({ error: 'Preventieve actie niet gevonden' })

    if (existing && body.data.status && existing.status !== body.data.status) {
      await logStatusChange(fastify, 'preventief', id, existing.status, body.data.status, employee?.name ?? null, employee?.employeeId ?? null)
    }

    return action
  })

  // DELETE verwijderen (alleen admin/quality)
  fastify.delete('/kiosk/preventief/:id', auth, async (req, reply) => {
    const PRIVILEGED_ROLES = ['admin', 'quality']
    const userRole = (req as { employee?: { role?: string } }).employee?.role ?? ''
    if (!PRIVILEGED_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: 'Geen rechten om preventieve acties te verwijderen' })
    }
    const { id } = req.params as { id: string }
    await fastify.db.delete(preventiveActions).where(eq(preventiveActions.id, id))
    return { ok: true }
  })
}
