import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { employees } from '../../db/schema.js'
import { eq, asc } from 'drizzle-orm'
import path from 'path'
import { randomUUID, randomBytes } from 'crypto'

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

const ROLES = ['employee', 'werkvoorbereider', 'manager', 'admin', 'quality', 'productie_engineer', 'projectmanager'] as const

const roleSchema = z.object({
  role: z.enum(ROLES),
})

const createEmployeeSchema = z.object({
  name: z.string().min(1),
  role: z.enum(ROLES).default('employee'),
  email: z.string().email().nullable().optional(),
})

const pinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PIN moet precies 4 cijfers zijn'),
})

const emailSchema = z.object({
  email: z.string().email().nullable().optional(),
})

export async function adminEmployeeRoutes(fastify: FastifyInstance) {
  // GET alle medewerkers
  fastify.get(
    '/admin/employees',
    { preHandler: [fastify.requireAdmin] },
    async () => {
      return fastify.db
        .select({
          id: employees.id,
          name: employees.name,
          email: employees.email,
          photoUrl: employees.photoUrl,
          isClockedIn: employees.isClockedIn,
          role: employees.role,
          bcId: employees.bcId,
        })
        .from(employees)
        .orderBy(asc(employees.name))
    },
  )

  // POST foto uploaden
  fastify.post(
    '/admin/employees/:id/photo',
    { preHandler: [fastify.requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const data = await req.file()
      if (!data) return reply.status(400).send({ error: 'Geen bestand ontvangen' })

      const ext = path.extname(data.filename).toLowerCase()
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return reply.status(400).send({ error: 'Bestandstype niet toegestaan (jpg, png, webp)' })
      }

      const filename = `${id}-${Date.now()}${ext}`
      const uploadPath = path.join('/app/uploads', filename)

      const { pipeline } = await import('stream/promises')
      const { createWriteStream } = await import('fs')
      await pipeline(data.file, createWriteStream(uploadPath))

      const photoUrl = `/uploads/${filename}`
      await fastify.db
        .update(employees)
        .set({ photoUrl })
        .where(eq(employees.id, id))

      return { photoUrl }
    },
  )

  // PUT rol wijzigen
  fastify.put(
    '/admin/employees/:id/role',
    { preHandler: [fastify.requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = roleSchema.safeParse(req.body)
      if (!body.success) return reply.status(400).send({ error: 'Ongeldige rol' })

      await fastify.db
        .update(employees)
        .set({ role: body.data.role })
        .where(eq(employees.id, id))

      return { ok: true }
    },
  )

  // PUT PIN instellen
  fastify.put(
    '/admin/employees/:id/pin',
    { preHandler: [fastify.requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = pinSchema.safeParse(req.body)
      if (!body.success) return reply.status(400).send({ error: body.error.errors[0].message })

      const pinHash = await bcrypt.hash(body.data.pin, 10)
      await fastify.db
        .update(employees)
        .set({ pinHash })
        .where(eq(employees.id, id))

      return { ok: true }
    },
  )

  // DELETE PIN verwijderen
  fastify.delete(
    '/admin/employees/:id/pin',
    { preHandler: [fastify.requireAdmin] },
    async (req) => {
      const { id } = req.params as { id: string }
      await fastify.db
        .update(employees)
        .set({ pinHash: null })
        .where(eq(employees.id, id))
      return { ok: true }
    },
  )

  // PATCH e-mail bijwerken
  fastify.patch(
    '/admin/employees/:id',
    { preHandler: [fastify.requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = emailSchema.safeParse(req.body)
      if (!body.success) return reply.status(400).send({ error: 'Ongeldig e-mailadres' })

      await fastify.db
        .update(employees)
        .set({ email: body.data.email ?? null })
        .where(eq(employees.id, id))

      return { ok: true }
    },
  )

  // POST medewerker handmatig aanmaken
  fastify.post(
    '/admin/employees',
    { preHandler: [fastify.requireAdmin] },
    async (req, reply) => {
      const body = createEmployeeSchema.safeParse(req.body)
      if (!body.success) return reply.status(400).send({ error: 'Ongeldige gegevens' })

      const [emp] = await fastify.db
        .insert(employees)
        .values({
          name: body.data.name,
          role: body.data.role,
          email: body.data.email ?? null,
        })
        .returning({ id: employees.id, name: employees.name, role: employees.role })

      return emp
    },
  )

  // DELETE medewerker verwijderen
  fastify.delete(
    '/admin/employees/:id',
    { preHandler: [fastify.requireAdmin] },
    async (req) => {
      const { id } = req.params as { id: string }
      await fastify.db.delete(employees).where(eq(employees.id, id))
      return { ok: true }
    },
  )
}

export async function seedAdminEmployee(fastify: FastifyInstance): Promise<void> {
  const existing = await fastify.db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.role, 'admin'))
    .limit(1)

  if (existing.length > 0) return

  const pin = String(randomBytes(2).readUInt16BE() % 9000 + 1000)
  const pinHash = await bcrypt.hash(pin, 10)

  await fastify.db.insert(employees).values({
    name: 'Admin',
    role: 'admin',
    pinHash,
  })

  fastify.log.info('========================================')
  fastify.log.info('Admin medewerker aangemaakt in kiosk:')
  fastify.log.info('  Naam: Admin')
  fastify.log.info(`  PIN:  ${pin}`)
  fastify.log.info('Wijzig de PIN via Beheer → Medewerkers')
  fastify.log.info('========================================')
}
