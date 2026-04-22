import { FastifyInstance } from 'fastify'
import { machines, breakdowns, maintenanceTasks, employees } from '../../db/schema.js'
import { eq, and, ne } from 'drizzle-orm'

export async function kioskMachinesReadonlyRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  // GET /kiosk/machines — actieve machines
  fastify.get('/kiosk/machines', auth, async () => {
    return fastify.db
      .select({
        id: machines.id,
        machineId: machines.machineId,
        name: machines.name,
        category: machines.category,
        photoUrl: machines.photoUrl,
      })
      .from(machines)
      .where(eq(machines.isActive, true))
      .orderBy(machines.name)
  })

  // GET /kiosk/machines/:id/breakdowns — open storingen voor machine
  fastify.get('/kiosk/machines/:id/breakdowns', auth, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select({
        id: breakdowns.id,
        title: breakdowns.title,
        description: breakdowns.description,
        status: breakdowns.status,
        priority: breakdowns.priority,
        reportedAt: breakdowns.reportedAt,
        reportedByName: employees.name,
      })
      .from(breakdowns)
      .leftJoin(employees, eq(breakdowns.reportedById, employees.id))
      .where(
        and(
          eq(breakdowns.machineId, id),
          ne(breakdowns.status, 'opgelost'),
        ),
      )
      .orderBy(breakdowns.reportedAt)
  })

  // GET /kiosk/machines/:id/maintenance — open onderhoudstaken voor machine
  fastify.get('/kiosk/machines/:id/maintenance', auth, async (req) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select({
        id: maintenanceTasks.id,
        title: maintenanceTasks.title,
        description: maintenanceTasks.description,
        status: maintenanceTasks.status,
        priority: maintenanceTasks.priority,
        scheduledDate: maintenanceTasks.scheduledDate,
        assignedToName: employees.name,
      })
      .from(maintenanceTasks)
      .leftJoin(employees, eq(maintenanceTasks.assignedToId, employees.id))
      .where(
        and(
          eq(maintenanceTasks.machineId, id),
          ne(maintenanceTasks.status, 'gereed'),
        ),
      )
      .orderBy(maintenanceTasks.scheduledDate)
  })

  // PUT /kiosk/breakdowns/:id/status — status bijwerken
  fastify.put('/kiosk/breakdowns/:id/status', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { status } = req.body as { status: string }

    const ALLOWED = ['gemeld', 'in_behandeling', 'opgelost']
    if (!ALLOWED.includes(status)) {
      return reply.status(400).send({ error: 'Ongeldige status' })
    }

    const [updated] = await fastify.db
      .update(breakdowns)
      .set({
        status,
        ...(status === 'opgelost' && { resolvedAt: new Date() }),
      })
      .where(eq(breakdowns.id, id))
      .returning()

    if (!updated) return reply.status(404).send({ error: 'Niet gevonden' })
    return updated
  })

  // PUT /kiosk/maintenance/:id/status — status bijwerken
  fastify.put('/kiosk/maintenance/:id/status', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { status } = req.body as { status: string }

    const ALLOWED = ['gepland', 'bezig', 'gereed']
    if (!ALLOWED.includes(status)) {
      return reply.status(400).send({ error: 'Ongeldige status' })
    }

    const [updated] = await fastify.db
      .update(maintenanceTasks)
      .set({ status })
      .where(eq(maintenanceTasks.id, id))
      .returning()

    if (!updated) return reply.status(404).send({ error: 'Niet gevonden' })
    return updated
  })
}
