import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof drizzle<typeof schema>>
  }
}

// PostgreSQL foutcodes die betekenen dat iets al bestaat — veilig te negeren
const ALREADY_EXISTS_CODES = new Set(['42P07', '42701', '42710', '42P06'])

/**
 * Eigen migratie-runner — bijhoudt uitgevoerde migraties op bestandsnaam (niet hash).
 * Drizzle's standaard migrate() gebruikt content-hashes die kunnen mismatch-en als
 * een bestand na de eerste run wordt aangepast, waardoor migraties stil worden overgeslagen.
 *
 * Deze runner probeert elke migratie te draaien en vangt "bestaat al" fouten af —
 * zo werkt het correct op zowel een verse als een bestaande database.
 */
async function runMigrations(sql: postgres.Sql, migrationsFolder: string) {
  await sql`
    CREATE TABLE IF NOT EXISTS mes_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  const applied = await sql<{ filename: string }[]>`
    SELECT filename FROM mes_migrations
  `
  const appliedSet = new Set(applied.map(r => r.filename))

  const files = fs
    .readdirSync(migrationsFolder)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    if (appliedSet.has(file)) continue

    const sqlContent = fs.readFileSync(path.join(migrationsFolder, file), 'utf-8').trim()
    if (!sqlContent) continue

    try {
      await sql.unsafe(sqlContent)
      await sql`INSERT INTO mes_migrations (filename) VALUES (${file})`
      console.log(`  ✓ ${file}`)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code && ALREADY_EXISTS_CODES.has(code)) {
        // Object bestaat al — migratie is effectief al toegepast
        await sql`INSERT INTO mes_migrations (filename) VALUES (${file}) ON CONFLICT DO NOTHING`
        console.log(`  ~ ${file} (al aanwezig)`)
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(`Migratie mislukt: ${file}\n${msg}`)
      }
    }
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is niet ingesteld')

  const migrationsFolder = path.join(__dirname, '../db/migrations')

  // Migratie client (max 1 connectie, sequentieel)
  const migrationClient = postgres(databaseUrl, { max: 1 })

  fastify.log.info('Database migraties uitvoeren...')
  await runMigrations(migrationClient, migrationsFolder)
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
