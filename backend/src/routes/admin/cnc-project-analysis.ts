import { FastifyInstance } from 'fastify'
import { sql } from 'drizzle-orm'

type Row = Record<string, unknown>

export async function cncProjectAnalysisRoutes(fastify: FastifyInstance) {
  const authRead = { preHandler: [fastify.requireAuth] }

  // ── Pareto: artikelen gerangschikt op verspaantijd ────────────────────────
  // GET /admin/cnc-project-analysis/pareto?since=<ISO>&machineId=<uuid>&limit=50&search=<term>

  fastify.get('/admin/cnc-project-analysis/pareto', authRead, async (req) => {
    const { since, machineId, limit = '50', search } = req.query as {
      since?: string
      machineId?: string
      limit?: string
      search?: string
    }

    const sinceIso = since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100)

    const rows = await fastify.db.execute(sql`
      SELECT
        SPLIT_PART(REPLACE(program_name, '\\', '/'), '/', 3) AS article,
        SUM(duration_seconds)::int                           AS total_seconds,
        COUNT(*)::int                                        AS run_count,
        COUNT(*) FILTER (WHERE status IN ('completed','stopped'))::int AS completed_runs,
        COUNT(*) FILTER (WHERE status IN ('interrupted','error'))::int AS interrupted_runs
      FROM cnc_program_runs
      WHERE started_at >= ${sinceIso}::timestamptz
        AND duration_seconds IS NOT NULL
        AND duration_seconds > 0
        ${machineId ? sql`AND machine_id = ${machineId}::uuid` : sql``}
        AND SPLIT_PART(REPLACE(program_name, '\\', '/'), '/', 3) <> ''
        ${search ? sql`AND SPLIT_PART(REPLACE(program_name, '\\', '/'), '/', 3) ILIKE ${'%' + search + '%'}` : sql``}
      GROUP BY article
      ORDER BY total_seconds DESC
      LIMIT ${limitNum}
    `) as unknown as Row[]

    return {
      articles: rows.map(r => ({
        article:         r.article as string,
        totalSeconds:    Number(r.total_seconds),
        runCount:        Number(r.run_count),
        completedRuns:   Number(r.completed_runs),
        interruptedRuns: Number(r.interrupted_runs),
      })),
    }
  })

  // ── Artikeldetail: aggregatie per machine + individuele runs ──────────────
  // GET /admin/cnc-project-analysis/detail?article=<string>&since=<ISO>&machineId=<uuid>

  fastify.get('/admin/cnc-project-analysis/detail', authRead, async (req, reply) => {
    const { article, since, machineId } = req.query as {
      article?: string
      since?: string
      machineId?: string
    }

    if (!article?.trim()) return reply.status(400).send({ error: 'article parameter verplicht' })

    const sinceIso = since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [byMachineRows, runRows] = await Promise.all([
      fastify.db.execute(sql`
        SELECT
          m.id,
          m.name,
          SUM(r.duration_seconds)::int                                               AS seconds,
          COUNT(*)::int                                                               AS run_count,
          COUNT(*) FILTER (WHERE r.status IN ('completed','stopped'))::int           AS completed_runs,
          COALESCE(SUM(r.duration_seconds) FILTER (WHERE r.status = 'interrupted'), 0)::int AS interrupted_seconds
        FROM cnc_program_runs r
        JOIN machines m ON m.id = r.machine_id
        WHERE SPLIT_PART(REPLACE(r.program_name, '\\', '/'), '/', 3) = ${article}
          AND r.started_at >= ${sinceIso}::timestamptz
          AND r.duration_seconds IS NOT NULL
          AND r.duration_seconds > 0
          ${machineId ? sql`AND r.machine_id = ${machineId}::uuid` : sql``}
        GROUP BY m.id, m.name
        ORDER BY seconds DESC
      `) as unknown as Row[],
      fastify.db.execute(sql`
        SELECT
          r.id,
          m.name AS machine_name,
          r.started_at,
          r.ended_at,
          r.duration_seconds,
          r.status
        FROM cnc_program_runs r
        JOIN machines m ON m.id = r.machine_id
        WHERE SPLIT_PART(REPLACE(r.program_name, '\\', '/'), '/', 3) = ${article}
          AND r.started_at >= ${sinceIso}::timestamptz
          AND r.duration_seconds IS NOT NULL
          AND r.duration_seconds > 0
          ${machineId ? sql`AND r.machine_id = ${machineId}::uuid` : sql``}
        ORDER BY r.started_at DESC
        LIMIT 100
      `) as unknown as Row[],
    ])

    const byMachine = byMachineRows.map(r => ({
      id:                 r.id as string,
      name:               r.name as string,
      seconds:            Number(r.seconds),
      runCount:           Number(r.run_count),
      completedRuns:      Number(r.completed_runs),
      interruptedSeconds: Number(r.interrupted_seconds),
    }))

    const totalSeconds       = byMachine.reduce((s, m) => s + m.seconds, 0)
    const runCount           = byMachine.reduce((s, m) => s + m.runCount, 0)
    const completedRuns      = byMachine.reduce((s, m) => s + m.completedRuns, 0)
    const interruptedSeconds = byMachine.reduce((s, m) => s + m.interruptedSeconds, 0)

    return {
      article,
      totalSeconds,
      runCount,
      completedRuns,
      interruptedSeconds,
      byMachine,
      runs: runRows.map(r => ({
        id:              r.id as string,
        machineName:     r.machine_name as string,
        startedAt:       new Date(r.started_at as string | Date).toISOString(),
        durationSeconds: r.duration_seconds != null ? Number(r.duration_seconds) : null,
        status:          r.status as string,
      })),
    }
  })
}
