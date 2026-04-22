import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { employees } from '../../db/schema.js'
import { eq, asc } from 'drizzle-orm'

const verifyPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PIN moet 4 cijfers zijn'),
})

export async function kioskEmployeeRoutes(fastify: FastifyInstance) {
  // GET medewerkerstegels (publiek — geen auth vereist)
  fastify.get('/kiosk/employees', async () => {
    return fastify.db
      .select({
        id: employees.id,
        name: employees.name,
        photoUrl: employees.photoUrl,
        isClockedIn: employees.isClockedIn,
        role: employees.role,
        hasPin: employees.pinHash,
      })
      .from(employees)
      .orderBy(asc(employees.name))
      .then((rows) =>
        rows.map((r) => ({ ...r, hasPin: r.hasPin !== null })),
      )
  })

  // POST PIN verifiëren → employee JWT
  fastify.post('/kiosk/employees/:id/verify-pin', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = verifyPinSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige PIN' })

    const rows = await fastify.db
      .select()
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1)

    if (!rows.length) return reply.status(404).send({ error: 'Medewerker niet gevonden' })

    const employee = rows[0]
    if (!employee.pinHash) {
      return reply.status(401).send({ error: 'PIN niet ingesteld' })
    }

    const valid = await bcrypt.compare(body.data.pin, employee.pinHash)
    if (!valid) {
      return reply.status(401).send({ error: 'Onjuiste PIN' })
    }

    const token = fastify.jwt.sign(
      { employeeId: employee.id, name: employee.name, role: employee.role },
      { expiresIn: '8h' },
    )

    return { token }
  })
}
