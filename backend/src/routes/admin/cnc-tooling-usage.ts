import { FastifyInstance } from 'fastify'
import { eq, sql } from 'drizzle-orm'
import { toolLibraryAssemblies, toolLibraryItems } from '../../db/schema.js'

interface AssemblyUsageRow extends Record<string, unknown> {
  id: string
  nc_number: number
  nc_name: string
  estimated_quantity: number | null
  component_capacity: number | null
  total_uses: string
  unique_setups: string
  total_seconds: string
  projects: string // JSON
}

interface ItemUsageRow extends Record<string, unknown> {
  id: string
  item_type: string
  name: string
  ordering_code: string | null
  estimated_quantity: number | null
  total_uses: string
  unique_setups: string
  total_seconds: string
  assembly_names: string // JSON array
  projects: string // JSON
}

interface ProjectEntry {
  setupId: string
  articleNo: string | null
  articleName: string | null
  createdAt: string
  archivedAt: string | null
  totalSeconds: number
}

function maxConcurrent(projects: ProjectEntry[]): number {
  if (!projects.length) return 0
  const now = new Date().toISOString()
  const events: [string, number][] = []
  for (const p of projects) {
    events.push([p.createdAt, +1])
    events.push([p.archivedAt ?? now, -1])
  }
  events.sort((a, b) => a[0].localeCompare(b[0]))
  let max = 0, curr = 0
  for (const [, delta] of events) {
    curr += delta
    if (curr > max) max = curr
  }
  return max
}

function fmtSeconds(s: number) {
  return Math.round(s)
}

export async function cncToolingUsageRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAdmin] }

  // ── GET usage per samenstelling ────────────────────────────────────────────
  fastify.get('/admin/cnc/tooling-usage/assemblies', auth, async () => {
    const rows = await fastify.db.execute<AssemblyUsageRow>(sql`
      WITH setup_machine_seconds AS (
        -- Per articleNo: totaal machinetijd (dedupliceer runs per run-id)
        SELECT
          SPLIT_PART(pr.program_name, '\', 3) AS article_no,
          SUM(pr.duration_seconds)            AS seconds
        FROM cnc_program_runs pr
        WHERE pr.status IN ('completed', 'stopped', 'interrupted')
          AND pr.duration_seconds > 0
          AND pr.program_name LIKE 'TNC:\\Program\\%'
        GROUP BY SPLIT_PART(pr.program_name, '\', 3)
      ),
      assembly_setups AS (
        -- Per samenstelling + setup: geaggregeerde data
        SELECT
          a.id                AS assembly_id,
          a.nc_number,
          a.nc_name,
          a.estimated_quantity,
          a.tool_item_id,
          a.holder_item_id,
          ps.id               AS setup_id,
          ps.article_no,
          ps.article_name,
          ps.created_at,
          ps.archived_at,
          COUNT(tc.id)        AS uses_in_setup,
          COALESCE(sms.seconds, 0) AS setup_seconds
        FROM tool_library_assemblies a
        JOIN product_setup_tool_calls tc
          ON LOWER(tc.tool_name) = LOWER(a.nc_name)
        JOIN product_setup_nc_files nf ON nf.id = tc.nc_file_id
        JOIN product_setup_steps s      ON s.id  = nf.step_id
        JOIN product_setups ps          ON ps.id = s.setup_id
        LEFT JOIN setup_machine_seconds sms ON sms.article_no = ps.article_no
        GROUP BY a.id, a.nc_number, a.nc_name, a.estimated_quantity,
                 a.tool_item_id, a.holder_item_id,
                 ps.id, ps.article_no, ps.article_name, ps.created_at, ps.archived_at,
                 sms.seconds
      )
      SELECT
        s.assembly_id                             AS id,
        s.nc_number,
        s.nc_name,
        s.estimated_quantity,
        LEAST(t.estimated_quantity, h.estimated_quantity) AS component_capacity,
        SUM(s.uses_in_setup)::text                AS total_uses,
        COUNT(DISTINCT s.setup_id)::text          AS unique_setups,
        SUM(s.setup_seconds)::text                AS total_seconds,
        JSON_AGG(JSON_BUILD_OBJECT(
          'setupId',     s.setup_id,
          'articleNo',   s.article_no,
          'articleName', s.article_name,
          'createdAt',   s.created_at,
          'archivedAt',  s.archived_at,
          'totalSeconds', s.setup_seconds
        ) ORDER BY s.setup_seconds DESC)          AS projects
      FROM assembly_setups s
      LEFT JOIN tool_library_items t ON t.id = s.tool_item_id
      LEFT JOIN tool_library_items h ON h.id = s.holder_item_id
      GROUP BY s.assembly_id, s.nc_number, s.nc_name, s.estimated_quantity,
               t.estimated_quantity, h.estimated_quantity
      ORDER BY SUM(s.setup_seconds) DESC, SUM(s.uses_in_setup) DESC
    `)

    return rows.map(r => {
      const projects = r.projects as unknown as ProjectEntry[]
      return {
        id:                 r.id,
        ncNumber:           r.nc_number,
        ncName:             r.nc_name,
        estimatedQuantity:  r.estimated_quantity,
        componentCapacity:  r.component_capacity ?? null,
        totalUses:          parseInt(r.total_uses as string),
        uniqueSetups:      parseInt(r.unique_setups as string),
        totalSeconds:      fmtSeconds(parseFloat(r.total_seconds as string)),
        maxConcurrent:     maxConcurrent(projects),
        projects,
      }
    })
  })

  // ── GET usage per component (items) ───────────────────────────────────────
  fastify.get('/admin/cnc/tooling-usage/items', auth, async () => {
    const rows = await fastify.db.execute<ItemUsageRow>(sql`
      WITH setup_machine_seconds AS (
        SELECT
          SPLIT_PART(pr.program_name, '\', 3) AS article_no,
          SUM(pr.duration_seconds)            AS seconds
        FROM cnc_program_runs pr
        WHERE pr.status IN ('completed', 'stopped', 'interrupted')
          AND pr.duration_seconds > 0
          AND pr.program_name LIKE 'TNC:\\Program\\%'
        GROUP BY SPLIT_PART(pr.program_name, '\', 3)
      ),
      item_via_assemblies AS (
        -- Items bereikbaar via tool_item_id of holder_item_id van een gebruikte samenstelling
        SELECT
          COALESCE(a.tool_item_id, a.holder_item_id) AS item_id,
          CASE WHEN a.tool_item_id IS NOT NULL THEN 'tool' ELSE 'holder' END AS role,
          tc.id               AS tc_id,
          ps.id               AS setup_id,
          ps.article_no,
          ps.article_name,
          ps.created_at,
          ps.archived_at,
          COALESCE(sms.seconds, 0) AS setup_seconds,
          a.nc_name           AS assembly_name
        FROM tool_library_assemblies a
        JOIN product_setup_tool_calls tc
          ON LOWER(tc.tool_name) = LOWER(a.nc_name)
        JOIN product_setup_nc_files nf ON nf.id = tc.nc_file_id
        JOIN product_setup_steps s      ON s.id  = nf.step_id
        JOIN product_setups ps          ON ps.id = s.setup_id
        LEFT JOIN setup_machine_seconds sms ON sms.article_no = ps.article_no
        WHERE a.tool_item_id IS NOT NULL OR a.holder_item_id IS NOT NULL
      ),
      -- Voeg ook holder toe als die anders is dan tool_item
      item_holders AS (
        SELECT
          a.holder_item_id AS item_id,
          'holder'         AS role,
          tc.id            AS tc_id,
          ps.id            AS setup_id,
          ps.article_no,
          ps.article_name,
          ps.created_at,
          ps.archived_at,
          COALESCE(sms.seconds, 0) AS setup_seconds,
          a.nc_name        AS assembly_name
        FROM tool_library_assemblies a
        JOIN product_setup_tool_calls tc
          ON LOWER(tc.tool_name) = LOWER(a.nc_name)
        JOIN product_setup_nc_files nf ON nf.id = tc.nc_file_id
        JOIN product_setup_steps s      ON s.id  = nf.step_id
        JOIN product_setups ps          ON ps.id = s.setup_id
        LEFT JOIN setup_machine_seconds sms ON sms.article_no = ps.article_no
        WHERE a.holder_item_id IS NOT NULL
          AND a.holder_item_id IS DISTINCT FROM a.tool_item_id
      ),
      all_item_uses AS (
        SELECT item_id, role, tc_id, setup_id, article_no, article_name,
               created_at, archived_at, setup_seconds, assembly_name
        FROM item_via_assemblies
        UNION ALL
        SELECT item_id, role, tc_id, setup_id, article_no, article_name,
               created_at, archived_at, setup_seconds, assembly_name
        FROM item_holders
      )
      SELECT
        i.id,
        i.item_type,
        i.name,
        i.ordering_code,
        i.estimated_quantity,
        COUNT(DISTINCT u.tc_id)::text    AS total_uses,
        COUNT(DISTINCT u.setup_id)::text AS unique_setups,
        SUM(u.setup_seconds)::text       AS total_seconds,
        JSON_AGG(DISTINCT u.assembly_name) FILTER (WHERE u.assembly_name IS NOT NULL) AS assembly_names,
        JSON_AGG(JSON_BUILD_OBJECT(
          'setupId',     u.setup_id,
          'articleNo',   u.article_no,
          'articleName', u.article_name,
          'createdAt',   u.created_at,
          'archivedAt',  u.archived_at,
          'totalSeconds', u.setup_seconds
        ) ORDER BY u.setup_seconds DESC) AS projects
      FROM tool_library_items i
      JOIN all_item_uses u ON u.item_id = i.id
      GROUP BY i.id, i.item_type, i.name, i.ordering_code, i.estimated_quantity
      ORDER BY SUM(u.setup_seconds) DESC, COUNT(DISTINCT u.tc_id) DESC
    `)

    return rows.map(r => {
      const projects = r.projects as unknown as ProjectEntry[]
      const assemblyNames = (r.assembly_names as unknown as string[] | null) ?? []
      return {
        id:                r.id,
        itemType:          r.item_type,
        name:              r.name,
        orderingCode:      r.ordering_code,
        estimatedQuantity: r.estimated_quantity,
        totalUses:         parseInt(r.total_uses as string),
        uniqueSetups:      parseInt(r.unique_setups as string),
        totalSeconds:      fmtSeconds(parseFloat(r.total_seconds as string)),
        maxConcurrent:     maxConcurrent(projects),
        assemblyNames,
        projects,
      }
    })
  })

  // ── PATCH estimated_quantity voor een samenstelling ────────────────────────
  fastify.patch('/admin/cnc/tooling-usage/assemblies/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { estimatedQuantity } = req.body as { estimatedQuantity: number | null }
    await fastify.db
      .update(toolLibraryAssemblies)
      .set({ estimatedQuantity: estimatedQuantity ?? null })
      .where(eq(toolLibraryAssemblies.id, id))
    return reply.status(204).send()
  })

  // ── PATCH estimated_quantity voor een component ────────────────────────────
  fastify.patch('/admin/cnc/tooling-usage/items/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { estimatedQuantity } = req.body as { estimatedQuantity: number | null }
    await fastify.db
      .update(toolLibraryItems)
      .set({ estimatedQuantity: estimatedQuantity ?? null })
      .where(eq(toolLibraryItems.id, id))
    return reply.status(204).send()
  })
}
