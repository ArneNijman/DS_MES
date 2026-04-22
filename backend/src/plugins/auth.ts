import fp from 'fastify-plugin'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

export interface JWTPayload {
  userId: string
  username: string
  role: 'admin'
}

export interface EmployeeJWTPayload {
  employeeId: string
  name: string
  role: string
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRole: (role: string) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    adminUser?: JWTPayload
    employee?: EmployeeJWTPayload
  }
}

export default fp(async (fastify: FastifyInstance) => {
  fastify.decorate(
    'requireAdmin',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const auth = req.headers.authorization
      if (!auth?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Niet geautoriseerd' })
      }
      try {
        const payload = fastify.jwt.verify<JWTPayload>(auth.slice(7))
        if (payload.role !== 'admin') {
          return reply.status(403).send({ error: 'Onvoldoende rechten' })
        }
        req.adminUser = payload
      } catch {
        return reply.status(401).send({ error: 'Ongeldige of verlopen sessie' })
      }
    },
  )

  fastify.decorate(
    'requireAuth',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const auth = req.headers.authorization
      if (!auth?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'UNAUTHORIZED' })
      }
      try {
        const payload = fastify.jwt.verify<EmployeeJWTPayload>(auth.slice(7))
        req.employee = payload
      } catch {
        return reply.status(401).send({ error: 'UNAUTHORIZED' })
      }
    },
  )

  fastify.decorate('requireRole', (role: string) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      const auth = req.headers.authorization
      if (!auth?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'UNAUTHORIZED' })
      }
      try {
        const payload = fastify.jwt.verify<EmployeeJWTPayload>(auth.slice(7))
        if (payload.role !== role && payload.role !== 'admin') {
          return reply.status(403).send({ error: 'FORBIDDEN' })
        }
        req.employee = payload
      } catch {
        return reply.status(401).send({ error: 'UNAUTHORIZED' })
      }
    }
  })
})
