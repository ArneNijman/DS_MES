import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { adminUsers } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'crypto'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export async function adminAuthRoutes(fastify: FastifyInstance) {
  fastify.post('/admin/login', async (req, reply) => {
    const body = loginSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Gebruikersnaam en wachtwoord zijn verplicht' })
    }

    const { username, password } = body.data
    const users = await fastify.db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.username, username))
      .limit(1)

    if (!users.length) {
      return reply.status(401).send({ error: 'Ongeldige inloggegevens' })
    }

    const user = users[0]
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: 'Ongeldige inloggegevens' })
    }

    const token = fastify.jwt.sign(
      { userId: user.id, username: user.username, role: 'admin' },
      { expiresIn: '24h' },
    )

    return { token }
  })
}

export async function seedAdminUser(fastify: FastifyInstance): Promise<void> {
  const existing = await fastify.db.select().from(adminUsers).limit(1)
  if (existing.length > 0) return

  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  const password = Array.from(randomBytes(16))
    .map((b) => chars[b % chars.length])
    .join('')

  const passwordHash = await bcrypt.hash(password, 12)
  await fastify.db.insert(adminUsers).values({ username: 'admin', passwordHash })

  fastify.log.info('========================================')
  fastify.log.info('Admin gebruiker aangemaakt:')
  fastify.log.info(`  Gebruikersnaam: admin`)
  fastify.log.info(`  Wachtwoord:     ${password}`)
  fastify.log.info('Sla dit wachtwoord op — het wordt niet opnieuw getoond!')
  fastify.log.info('========================================')
}
