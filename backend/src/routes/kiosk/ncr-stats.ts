import { FastifyInstance } from 'fastify'
import { sql } from 'drizzle-orm'

type Row = Record<string, unknown>

export async function ncrStatsRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  fastify.get('/kiosk/ncr/statistics', auth, async (req) => {
    const q = req.query as { year?: string; causingDepartment?: string }
    const yearNum = q.year ? parseInt(q.year, 10) : null
    const dept    = q.causingDepartment || null

    // Conditional WHERE fragments (AND-prefixed so they can be appended after base condition)
    const yf  = yearNum !== null ? sql`AND EXTRACT(YEAR FROM created_at) = ${yearNum}` : sql``
    const df  = dept    !== null ? sql`AND causing_department = ${dept}`                : sql``
    const yfj = yearNum !== null ? sql`AND EXTRACT(YEAR FROM nr.created_at) = ${yearNum}` : sql``
    const dfj = dept    !== null ? sql`AND nr.causing_department = ${dept}`               : sql``

    const [summary, openOld, perMaand, perAfdeling, perFaultCode, perCauseCode,
           perDisposition, topCombinaties, jaren, doorlooptijd] = await Promise.all([

      fastify.db.execute(sql`
        SELECT
          COUNT(*)::int                                                              AS totaal,
          COUNT(*) FILTER (WHERE status IN ('open','in_behandeling','in_uitvoering'))::int AS actief,
          COUNT(*) FILTER (WHERE status = 'gesloten')::int                          AS gesloten,
          COUNT(*) FILTER (WHERE measure_required = true)::int                      AS maatregel_nodig
        FROM ncr_registrations WHERE 1=1 ${yf} ${df}
      `),

      fastify.db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM ncr_registrations
        WHERE status IN ('open','in_behandeling','in_uitvoering')
          AND created_at < NOW() - INTERVAL '30 days' ${yf} ${df}
      `),

      fastify.db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
               COUNT(*)::int AS count
        FROM ncr_registrations WHERE 1=1 ${yf} ${df}
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY 1
      `),

      fastify.db.execute(sql`
        SELECT causing_department, COUNT(*)::int AS count
        FROM ncr_registrations
        WHERE causing_department IS NOT NULL ${yf} ${df}
        GROUP BY causing_department
        ORDER BY count DESC
      `),

      fastify.db.execute(sql`
        SELECT fault_code, COUNT(*)::int AS count
        FROM ncr_registrations
        WHERE fault_code IS NOT NULL ${yf} ${df}
        GROUP BY fault_code
        ORDER BY count DESC
      `),

      fastify.db.execute(sql`
        SELECT cause_code, COUNT(*)::int AS count
        FROM ncr_registrations
        WHERE cause_code IS NOT NULL ${yf} ${df}
        GROUP BY cause_code
        ORDER BY count DESC
      `),

      fastify.db.execute(sql`
        SELECT disposition_type, COUNT(*)::int AS count
        FROM ncr_registrations
        WHERE disposition_type IS NOT NULL ${yf} ${df}
        GROUP BY disposition_type
        ORDER BY count DESC
      `),

      fastify.db.execute(sql`
        SELECT causing_department, fault_code, COUNT(*)::int AS count
        FROM ncr_registrations
        WHERE causing_department IS NOT NULL AND fault_code IS NOT NULL ${yf} ${df}
        GROUP BY causing_department, fault_code
        ORDER BY count DESC
        LIMIT 10
      `),

      // Beschikbare jaren: onafhankelijk van jaar-filter zodat alle knoppen zichtbaar blijven
      fastify.db.execute(sql`
        SELECT DISTINCT EXTRACT(YEAR FROM created_at)::int AS year
        FROM ncr_registrations
        ORDER BY 1
      `),

      fastify.db.execute(sql`
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (sl.created_at - nr.created_at)) / 86400)::numeric, 1) AS avg_days
        FROM ncr_registrations nr
        JOIN status_logs sl
          ON sl.entity_id   = nr.id
         AND sl.entity_type = 'ncr'
         AND sl.to_status   = 'gesloten'
        WHERE nr.status = 'gesloten' ${yfj} ${dfj}
      `),
    ])

    const s      = (summary as Row[])[0] ?? {}
    const totaal = Number(s.totaal ?? 0)

    return {
      totaal,
      actief:                 Number(s.actief            ?? 0),
      gesloten:               Number(s.gesloten          ?? 0),
      openOuderDan30:         Number((openOld as Row[])[0]?.count ?? 0),
      maatregelNodigPct:      totaal > 0 ? Math.round(Number(s.maatregel_nodig ?? 0) / totaal * 100) : 0,
      gemiddeldeDoorlooptijd: (doorlooptijd as Row[])[0]?.avg_days != null
        ? parseFloat(String((doorlooptijd as Row[])[0].avg_days))
        : null,

      perMaand:         (perMaand       as Row[]).map((r) => ({ month:             String(r.month),              count: Number(r.count) })),
      perAfdeling:      (perAfdeling    as Row[]).map((r) => ({ causingDepartment: String(r.causing_department), count: Number(r.count) })),
      perFaultCode:     (perFaultCode   as Row[]).map((r) => ({ faultCode:         String(r.fault_code),         count: Number(r.count) })),
      perCauseCode:     (perCauseCode   as Row[]).map((r) => ({ causeCode:         String(r.cause_code),         count: Number(r.count) })),
      perDispositionType:(perDisposition as Row[]).map((r) => ({ dispositionType:  String(r.disposition_type),   count: Number(r.count) })),
      topCombinaties:   (topCombinaties  as Row[]).map((r) => ({
        causingDepartment: String(r.causing_department),
        faultCode:         String(r.fault_code),
        count:             Number(r.count),
      })),
      beschikbareJaren: (jaren as Row[]).map((r) => Number(r.year)),
    }
  })
}
