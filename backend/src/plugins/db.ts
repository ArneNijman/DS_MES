import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from '../db/schema.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof drizzle<typeof schema>>
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is niet ingesteld')

  const migrationsFolder = path.join(__dirname, '../db/migrations')

  // Migratie client (max 1 connectie)
  const migrationClient = postgres(databaseUrl, { max: 1 })
  const migrationDb = drizzle(migrationClient, { schema })

  fastify.log.info('Database migraties uitvoeren...')
  await migrate(migrationDb, { migrationsFolder })
  await migrationClient.end()
  fastify.log.info('Migraties voltooid')

  // Applicatie client
  const queryClient = postgres(databaseUrl)
  const db = drizzle(queryClient, { schema })

  fastify.decorate('db', db)

  fastify.addHook('onClose', async () => {
    await queryClient.end()
  })
})
