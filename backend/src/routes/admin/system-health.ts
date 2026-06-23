import { FastifyInstance } from 'fastify'
import { readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../db/migrations')

type CheckStatus = 'ok' | 'warn' | 'fail'
interface HealthCheck {
  name: string
  status: CheckStatus
  detail?: string
}

async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    return res.ok || res.status < 500
  } catch {
    return false
  }
}

export async function systemHealthRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  fastify.get('/admin/system-health', auth, async () => {
    const checks: HealthCheck[] = []

    // Database — als deze query werkt, is de DB bereikbaar
    try {
      await fastify.db.execute(sql`SELECT 1`)
      checks.push({ name: 'Database', status: 'ok' })
    } catch {
      checks.push({ name: 'Database', status: 'fail', detail: 'Niet bereikbaar' })
    }

    // Migraties
    try {
      const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'))
      const [row] = await fastify.db.execute<{ count: string }>(
        sql`SELECT COUNT(*)::text AS count FROM mes_migrations`
      )
      const applied = parseInt(row.count ?? '0', 10)
      const total = files.length
      if (applied === total) {
        checks.push({ name: 'Migraties', status: 'ok', detail: `${applied}/${total}` })
      } else {
        const appliedNames = await fastify.db.execute<{ filename: string }>(
          sql`SELECT filename FROM mes_migrations`
        )
        const appliedSet = new Set(appliedNames.map(r => r.filename))
        const missing = files.filter(f => !appliedSet.has(f))
        checks.push({
          name: 'Migraties',
          status: 'fail',
          detail: `${applied}/${total} — openstaand: ${missing.join(', ')}`,
        })
      }
    } catch {
      checks.push({ name: 'Migraties', status: 'warn', detail: 'Kon niet controleren' })
    }

    // CNC agent
    const cncUrl = process.env.CNC_AGENT_URL ?? 'http://host.docker.internal:3099'
    const cncReachable = await fetchWithTimeout(`${cncUrl}/health`)
    checks.push({
      name: 'CNC agent',
      status: cncReachable ? 'ok' : 'warn',
      detail: cncReachable ? cncUrl : `Niet bereikbaar op ${cncUrl}`,
    })

    // Overal status bepalen
    const overallStatus: CheckStatus =
      checks.some(c => c.status === 'fail') ? 'fail' :
      checks.some(c => c.status === 'warn') ? 'warn' : 'ok'

    return { status: overallStatus, checks }
  })
}
