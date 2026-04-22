import { FastifyInstance } from 'fastify'
import { bcFieldMap } from '../../db/schema.js'
import { asc } from 'drizzle-orm'

export async function adminBcFieldMapRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/admin/bc-field-map',
    { preHandler: [fastify.requireAdmin] },
    async () => {
      const rows = await fastify.db
        .select()
        .from(bcFieldMap)
        .orderBy(asc(bcFieldMap.entityType), asc(bcFieldMap.logicalField))

      // Groepeer per entityType
      const grouped: Record<string, typeof rows> = {}
      for (const row of rows) {
        if (!grouped[row.entityType]) grouped[row.entityType] = []
        grouped[row.entityType].push(row)
      }

      return grouped
    },
  )
}
