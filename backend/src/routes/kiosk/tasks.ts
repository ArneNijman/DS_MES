import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tasks, employees } from '../../db/schema.js'
import { eq, and, or, inArray, desc } from 'drizzle-orm'
import { sendMail, getNotifiableEmployees, mailLayout } from '../../lib/mailer.js'

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  priority: z.enum(['kritisch', 'laag']).default('laag'),
  dueDate: z.string().optional().nullable(),
  status: z.enum(['open', 'in_uitvoering', 'gereed', 'gearchiveerd']).optional(),
  isFavorite: z.boolean().optional(),
  machineIds: z.array(z.string().uuid()).optional().default([]),
})

export async function kioskTaskRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  function getEmployeeId(req: any): string {
    return req.employee?.employeeId ?? ''
  }

  // GET /kiosk/tasks/counts — badge counts
  fastify.get('/kiosk/tasks/counts', auth, async (req) => {
    const employeeId = getEmployeeId(req)
    if (!employeeId) return { kritisch: 0, laag: 0, storingen: 0, onderhoud: 0 }

    const myTasks = await fastify.db
      .select({ priority: tasks.priority })
      .from(tasks)
      .where(
        and(
          or(
            eq(tasks.createdById, employeeId),
            and(eq(tasks.assignedToId, employeeId), eq(tasks.assignmentStatus, 'geaccepteerd')),
          ),
          inArray(tasks.status, ['open', 'in_uitvoering']),
        ),
      )

    const kritisch = myTasks.filter((t) => t.priority === 'kritisch').length
    const laag = myTasks.filter((t) => t.priority === 'laag').length

    return { kritisch, laag, storingen: 0, onderhoud: 0 }
  })

  // GET /kiosk/tasks/incoming — taken toegewezen aan mij die nog in_afwachting zijn
  fastify.get('/kiosk/tasks/incoming', auth, async (req) => {
    const employeeId = getEmployeeId(req)
    if (!employeeId) return []

    return fastify.db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        status: tasks.status,
        isFavorite: tasks.isFavorite,
        machineIds: tasks.machineIds,
        assignedToId: tasks.assignedToId,
        assignedById: tasks.assignedById,
        assignmentStatus: tasks.assignmentStatus,
        createdById: tasks.createdById,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        assignedByName: employees.name,
      })
      .from(tasks)
      .leftJoin(employees, eq(tasks.assignedById, employees.id))
      .where(
        and(
          eq(tasks.assignedToId, employeeId),
          eq(tasks.assignmentStatus, 'in_afwachting'),
        ),
      )
      .orderBy(desc(tasks.createdAt))
  })

  // GET /kiosk/tasks/my — mijn taken (aangemaakt door mij of toegewezen aan mij, geaccepteerd)
  fastify.get('/kiosk/tasks/my', auth, async (req) => {
    const employeeId = getEmployeeId(req)
    if (!employeeId) return []

    return fastify.db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        status: tasks.status,
        isFavorite: tasks.isFavorite,
        machineIds: tasks.machineIds,
        assignedToId: tasks.assignedToId,
        assignedById: tasks.assignedById,
        assignmentStatus: tasks.assignmentStatus,
        createdById: tasks.createdById,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(
        or(
          eq(tasks.createdById, employeeId),
          and(eq(tasks.assignedToId, employeeId), eq(tasks.assignmentStatus, 'geaccepteerd')),
        ),
      )
      .orderBy(desc(tasks.createdAt))
  })

  // POST /kiosk/tasks — aanmaken
  fastify.post('/kiosk/tasks', auth, async (req, reply) => {
    const employeeId = getEmployeeId(req)
    if (!employeeId) return reply.status(401).send({ error: 'Unauthorized' })

    const body = taskSchema.parse(req.body)

    const [task] = await fastify.db
      .insert(tasks)
      .values({
        title: body.title,
        description: body.description ?? null,
        priority: body.priority,
        dueDate: body.dueDate ?? null,
        machineIds: body.machineIds ?? [],
        createdById: employeeId,
      })
      .returning()

    return reply.status(201).send(task)
  })

  // PUT /kiosk/tasks/:id — bewerken
  fastify.put('/kiosk/tasks/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const employeeId = getEmployeeId(req)

    const body = taskSchema.partial().parse(req.body)

    const [existing] = await fastify.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .limit(1)

    if (!existing) return reply.status(404).send({ error: 'Niet gevonden' })
    if (existing.createdById !== employeeId && existing.assignedToId !== employeeId) {
      return reply.status(403).send({ error: 'Geen toegang' })
    }

    const [updated] = await fastify.db
      .update(tasks)
      .set({
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.priority !== undefined && { priority: body.priority }),
        ...(body.dueDate !== undefined && { dueDate: body.dueDate }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.isFavorite !== undefined && { isFavorite: body.isFavorite }),
        ...(body.machineIds !== undefined && { machineIds: body.machineIds }),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning()

    return updated
  })

  // DELETE /kiosk/tasks/:id — verwijderen (alleen eigen taken)
  fastify.delete('/kiosk/tasks/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const employeeId = getEmployeeId(req)

    const [existing] = await fastify.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .limit(1)

    if (!existing) return reply.status(404).send({ error: 'Niet gevonden' })
    if (existing.createdById !== employeeId && existing.assignedToId !== employeeId) {
      return reply.status(403).send({ error: 'Geen toegang' })
    }

    await fastify.db.delete(tasks).where(eq(tasks.id, id))
    return { ok: true }
  })

  // POST /kiosk/tasks/:id/assign — toewijzen aan collega
  fastify.post('/kiosk/tasks/:id/assign', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const employeeId = getEmployeeId(req)
    const { assignedToId } = req.body as { assignedToId: string }

    const [existing] = await fastify.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .limit(1)

    if (!existing) return reply.status(404).send({ error: 'Niet gevonden' })
    if (existing.createdById !== employeeId) {
      return reply.status(403).send({ error: 'Geen toegang' })
    }

    const [updated] = await fastify.db
      .update(tasks)
      .set({
        assignedToId,
        assignedById: employeeId,
        assignmentStatus: 'in_afwachting',
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning()

    // Email notificatie naar toegewezene
    const ontvangers = await getNotifiableEmployees(fastify.db, { ids: [assignedToId] })
    if (ontvangers.length > 0) {
      const [ontvanger] = ontvangers
      sendMail(fastify.db, {
        to: ontvanger.email,
        subject: `Nieuwe taak toegewezen: ${existing.title}`,
        html: mailLayout('Nieuwe taak', `
          <p>Hallo ${ontvanger.name},</p>
          <p>Er is een taak aan jou toegewezen:</p>
          <div class="section">
            <div class="item"><strong>${existing.title}</strong></div>
            ${existing.description ? `<div class="item">${existing.description}</div>` : ''}
            <div class="item">Prioriteit: <span class="badge badge-orange">${existing.priority}</span></div>
          </div>
          <p>Log in op het MES-systeem om de taak te bekijken.</p>
        `),
      }).catch(() => {})
    }

    return updated
  })

  // POST /kiosk/tasks/:id/accept — accepteren
  fastify.post('/kiosk/tasks/:id/accept', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const employeeId = getEmployeeId(req)

    const [existing] = await fastify.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .limit(1)

    if (!existing) return reply.status(404).send({ error: 'Niet gevonden' })
    if (existing.assignedToId !== employeeId) {
      return reply.status(403).send({ error: 'Geen toegang' })
    }

    const [updated] = await fastify.db
      .update(tasks)
      .set({ assignmentStatus: 'geaccepteerd', updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning()

    return updated
  })

  // POST /kiosk/tasks/:id/reject — afwijzen
  fastify.post('/kiosk/tasks/:id/reject', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const employeeId = getEmployeeId(req)

    const [existing] = await fastify.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .limit(1)

    if (!existing) return reply.status(404).send({ error: 'Niet gevonden' })
    if (existing.assignedToId !== employeeId) {
      return reply.status(403).send({ error: 'Geen toegang' })
    }

    const [updated] = await fastify.db
      .update(tasks)
      .set({
        assignedToId: null,
        assignedById: null,
        assignmentStatus: null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning()

    return updated
  })
}
