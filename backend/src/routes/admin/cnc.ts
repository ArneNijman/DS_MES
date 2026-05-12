import { FastifyInstance } from 'fastify'
import { eq, desc, isNotNull, or, and, asc, ilike, sql, inArray } from 'drizzle-orm'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'
import postgres from 'postgres'
import {
  machines, cncToolEntries, cncSyncLogs,
  toolLibraryAssemblies, toolLibraryItems, toolLibraryAssemblyComponents,
  appSettings,
} from '../../db/schema.js'
import { parseToolTable, type ToolTableFormat } from '../../cnc/toolTableParser.js'
import { importToolLibraryFromFile } from '../../cnc/importToolLibrary.js'
import { syncToolingArticles } from '../../cnc/syncToolingArticles.js'
import { callAgent } from '../../cnc/agentProxy.js'

// Alias helpers voor dubbele join op tool_library_items
const toolItem   = toolLibraryItems
const holderItem = toolLibraryItems

export async function cncRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAdmin] }
  const authRead = { preHandler: [fastify.requireAuth] }

  // ── CNC machines ophalen ──────────────────────────────────────────────────
  // Alleen machines met een IP-adres of CNC-controller (zijn CNC-machines)

  fastify.get('/kiosk/cnc/machines', authRead, async () => {
    return fastify.db
      .select({
        id:            machines.id,
        machineId:     machines.machineId,
        name:          machines.name,
        category:      machines.category,
        manufacturer:  machines.manufacturer,
        cncController: machines.cncController,
        cncIpAddress:  machines.cncIpAddress,
        isActive:      machines.isActive,
        photoUrl:      machines.photoUrl,
      })
      .from(machines)
      .where(
        and(
          eq(machines.isActive, true),
          or(
            isNotNull(machines.cncIpAddress),
            isNotNull(machines.cncController),
          ),
        ),
      )
      .orderBy(machines.name)
  })

  // ── Tools + stats voor een machine ───────────────────────────────────────

  fastify.get('/kiosk/cnc/machines/:id/tools', authRead, async (req, reply) => {
    const { id } = req.params as { id: string }

    // Controleer machine bestaat
    const machineRows = await fastify.db
      .select({ id: machines.id, name: machines.name, cncMaxTools: machines.cncMaxTools })
      .from(machines)
      .where(eq(machines.id, id))
      .limit(1)
    if (!machineRows.length) return reply.status(404).send({ error: 'Machine niet gevonden' })

    const tools = await fastify.db
      .select()
      .from(cncToolEntries)
      .where(eq(cncToolEntries.machineId, id))
      .orderBy(cncToolEntries.toolNumber)

    // Stats berekenen — alleen named tools (name niet null = echte tool in het magazijn)
    let total = 0
    let atRisk = 0
    let critical = 0
    let expired = 0
    let locked = 0

    for (const t of tools) {
      if (!t.name) continue   // lege positie telt niet mee
      total++
      if (t.locked) locked++
      const time2 = t.time2 ? parseFloat(t.time2) : 0
      const curTime = t.curTime ? parseFloat(t.curTime) : 0
      if (time2 > 0) {
        const pct = curTime / time2
        if (pct >= 1.0)       expired++
        else if (pct >= 0.90) critical++
        else if (pct >= 0.70) atRisk++
      }
    }

    // Laatste sync info
    const lastSync = await fastify.db
      .select()
      .from(cncSyncLogs)
      .where(eq(cncSyncLogs.machineId, id))
      .orderBy(desc(cncSyncLogs.startedAt))
      .limit(1)

    return {
      stats: { total, atRisk, critical, expired, locked },
      cncMaxTools: machineRows[0].cncMaxTools ?? null,
      lastSync: lastSync[0] ?? null,
      tools,
    }
  })

  // ── On-demand sync via Windows agent ─────────────────────────────────────

  fastify.post('/kiosk/cnc/trigger-sync', authRead, async (_req, reply) => {
    try {
      const res = await callAgent('/sync', { method: 'POST' }, 5_000)
      if (!res.ok) throw new Error(`Agent HTTP ${res.status}`)
      return { ok: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Onbekend'
      return reply.status(502).send({ error: `CNC agent niet bereikbaar: ${msg}` })
    }
  })

  // ── Alle tools (alle machines) ───────────────────────────────────────────

  fastify.get('/kiosk/cnc/tools', authRead, async () => {
    const tools = await fastify.db
      .select({
        id:         cncToolEntries.id,
        machineId:  cncToolEntries.machineId,
        machineName: machines.name,
        toolNumber: cncToolEntries.toolNumber,
        name:       cncToolEntries.name,
        l:          cncToolEntries.l,
        r:          cncToolEntries.r,
        dl:         cncToolEntries.dl,
        dr:         cncToolEntries.dr,
        time2:      cncToolEntries.time2,
        curTime:    cncToolEntries.curTime,
        doc:        cncToolEntries.doc,
        locked:     cncToolEntries.locked,
        syncedAt:   cncToolEntries.syncedAt,
        createdAt:  cncToolEntries.createdAt,
      })
      .from(cncToolEntries)
      .innerJoin(machines, eq(cncToolEntries.machineId, machines.id))
      .orderBy(asc(machines.name), asc(cncToolEntries.toolNumber))

    let atRisk = 0
    let critical = 0
    let expired = 0
    let locked = 0

    for (const t of tools) {
      if (t.locked) locked++
      const time2 = t.time2 ? parseFloat(t.time2) : 0
      const curTime = t.curTime ? parseFloat(t.curTime) : 0
      if (time2 > 0) {
        const pct = curTime / time2
        if (pct >= 1.0)       expired++
        else if (pct >= 0.90) critical++
        else if (pct >= 0.70) atRisk++
      }
    }

    return {
      stats: { total: tools.length, atRisk, critical, expired, locked },
      tools,
    }
  })

  // ── Sync logs voor een machine ────────────────────────────────────────────

  fastify.get('/kiosk/cnc/machines/:id/sync-logs', authRead, async (req, reply) => {
    const { id } = req.params as { id: string }
    return fastify.db
      .select()
      .from(cncSyncLogs)
      .where(eq(cncSyncLogs.machineId, id))
      .orderBy(desc(cncSyncLogs.startedAt))
      .limit(20)
  })

  // ── Tool Library: samenstellingen lijst ──────────────────────────────────

  fastify.get('/kiosk/cnc/assemblies', authRead, async (req) => {
    const { search, type } = req.query as { search?: string; type?: string }

    // Raw SQL voor de dubbele join op tool_library_items (tool + houder)
    const rows = await fastify.db.execute<{
      id: string
      nc_number: number
      nc_name: string
      comment: string | null
      tool_length: number | null
      preset_diameter: number | null
      tool_item_id: string | null
      holder_item_id: string | null
      tool_name: string | null
      tool_category: string | null
      tool_manufacturer: string | null
      holder_name: string | null
      holder_manufacturer: string | null
      component_count: string
      machine_count: string
    }>(sql`
      SELECT
        a.id,
        a.nc_number,
        a.nc_name,
        a.comment,
        a.tool_length,
        a.preset_diameter,
        a.tool_item_id,
        a.holder_item_id,
        t.name           AS tool_name,
        t.item_category  AS tool_category,
        t.manufacturer   AS tool_manufacturer,
        h.name           AS holder_name,
        h.manufacturer   AS holder_manufacturer,
        COUNT(DISTINCT c.id)::text         AS component_count,
        COUNT(DISTINCT e.machine_id)::text AS machine_count
      FROM tool_library_assemblies a
      LEFT JOIN tool_library_items t ON a.tool_item_id    = t.id
      LEFT JOIN tool_library_items h ON a.holder_item_id  = h.id
      LEFT JOIN tool_library_assembly_components c ON c.assembly_id = a.id
      LEFT JOIN cnc_tool_entries e ON e.name = a.nc_name
      WHERE (
        ${search ? sql`(
          a.nc_name ILIKE ${'%' + search + '%'}
          OR t.name ILIKE ${'%' + search + '%'}
          OR h.name ILIKE ${'%' + search + '%'}
          OR t.comment ILIKE ${'%' + search + '%'}
          OR h.comment ILIKE ${'%' + search + '%'}
        )` : sql`TRUE`}
        AND ${type ? sql`t.item_category ILIKE ${'%' + type + '%'}` : sql`TRUE`}
      )
      GROUP BY a.id, t.name, t.item_category, t.manufacturer, h.name, h.manufacturer
      ORDER BY a.nc_number ASC
    `)

    return {
      assemblies: rows.map(r => ({
        id:               r.id,
        ncNumber:         r.nc_number,
        ncName:           r.nc_name,
        comment:          r.comment,
        toolLength:       r.tool_length,
        presetDiameter:   r.preset_diameter,
        toolName:         r.tool_name,
        toolCategory:     r.tool_category,
        toolManufacturer: r.tool_manufacturer,
        holderName:       r.holder_name,
        holderManufacturer: r.holder_manufacturer,
        componentCount:   parseInt(r.component_count ?? '0', 10),
        machineCount:     parseInt(r.machine_count   ?? '0', 10),
      })),
    }
  })

  // ── Tool Library: detail van één samenstelling ────────────────────────────

  fastify.get('/kiosk/cnc/assemblies/:ncName', authRead, async (req, reply) => {
    const { ncName } = req.params as { ncName: string }

    // Samenstelling ophalen
    const assemblyRows = await fastify.db.execute<{
      id: string
      nc_number: number
      nc_name: string
      comment: string | null
      tool_length: number | null
      preset_diameter: number | null
      tool_name: string | null
      tool_category: string | null
      tool_comment: string | null
      tool_ordering: string | null
      tool_manufacturer: string | null
      tool_photo_url: string | null
      tool_wisselplaat_photo_url: string | null
      tool_schroef_ordering_code: string | null
      tool_schroef_photo_url: string | null
      holder_name: string | null
      holder_comment: string | null
      holder_ordering: string | null
      holder_manufacturer: string | null
      holder_photo_url: string | null
      holder_wisselplaat_photo_url: string | null
      holder_schroef_ordering_code: string | null
      holder_schroef_photo_url: string | null
    }>(sql`
      SELECT
        a.id, a.nc_number, a.nc_name, a.comment, a.tool_length, a.preset_diameter,
        t.name                    AS tool_name,
        t.item_category           AS tool_category,
        t.comment                 AS tool_comment,
        t.ordering_code           AS tool_ordering,
        t.manufacturer            AS tool_manufacturer,
        t.photo_url               AS tool_photo_url,
        t.wisselplaat_photo_url   AS tool_wisselplaat_photo_url,
        t.schroef_ordering_code   AS tool_schroef_ordering_code,
        t.schroef_photo_url       AS tool_schroef_photo_url,
        h.name                    AS holder_name,
        h.comment                 AS holder_comment,
        h.ordering_code           AS holder_ordering,
        h.manufacturer            AS holder_manufacturer,
        h.photo_url               AS holder_photo_url,
        h.wisselplaat_photo_url   AS holder_wisselplaat_photo_url,
        h.schroef_ordering_code   AS holder_schroef_ordering_code,
        h.schroef_photo_url       AS holder_schroef_photo_url
      FROM tool_library_assemblies a
      LEFT JOIN tool_library_items t ON a.tool_item_id   = t.id
      LEFT JOIN tool_library_items h ON a.holder_item_id = h.id
      WHERE a.nc_name = ${ncName}
      LIMIT 1
    `)

    if (!assemblyRows.length) {
      return reply.status(404).send({ error: 'Samenstelling niet gevonden' })
    }
    const a = assemblyRows[0]

    // Tussenstukken (componenten)
    const componentRows = await fastify.db
      .select({
        position:            toolLibraryAssemblyComponents.position,
        reach:               toolLibraryAssemblyComponents.reach,
        name:                toolLibraryItems.name,
        comment:             toolLibraryItems.comment,
        orderingCode:        toolLibraryItems.orderingCode,
        manufacturer:        toolLibraryItems.manufacturer,
        itemCategory:        toolLibraryItems.itemCategory,
        photoUrl:            toolLibraryItems.photoUrl,
        wisselplaatPhotoUrl: toolLibraryItems.wisselplaatPhotoUrl,
        schroefOrderingCode: toolLibraryItems.schroefOrderingCode,
        schroefPhotoUrl:     toolLibraryItems.schroefPhotoUrl,
      })
      .from(toolLibraryAssemblyComponents)
      .innerJoin(toolLibraryItems, eq(toolLibraryAssemblyComponents.itemId, toolLibraryItems.id))
      .where(eq(toolLibraryAssemblyComponents.assemblyId, a.id))
      .orderBy(asc(toolLibraryAssemblyComponents.position))

    // Machine-instanties: welke machines hebben deze tool in het magazijn?
    const instanceRows = await fastify.db
      .select({
        toolNumber:  cncToolEntries.toolNumber,
        l:           cncToolEntries.l,
        r:           cncToolEntries.r,
        curTime:     cncToolEntries.curTime,
        time2:       cncToolEntries.time2,
        locked:      cncToolEntries.locked,
        syncedAt:    cncToolEntries.syncedAt,
        machineName: machines.name,
        machineId:   machines.id,
      })
      .from(cncToolEntries)
      .innerJoin(machines, eq(cncToolEntries.machineId, machines.id))
      .where(eq(cncToolEntries.name, ncName))
      .orderBy(asc(machines.name), asc(cncToolEntries.toolNumber))

    // Bouw componentenlijst op in volgorde: houder → tussenstukken → snijgereedschap
    type AssemblyComponent = {
      type: string
      position: number
      reach?: number | null
      name: string
      comment: string | null
      orderingCode: string | null
      manufacturer: string | null
      category: string | null
      photoUrl: string | null
      wisselplaatPhotoUrl: string | null
      schroefOrderingCode: string | null
      schroefPhotoUrl: string | null
    }

    const components: AssemblyComponent[] = []

    if (a.holder_name) {
      components.push({
        type:                'holder',
        position:            -1,
        name:                a.holder_name,
        comment:             a.holder_comment,
        orderingCode:        a.holder_ordering,
        manufacturer:        a.holder_manufacturer,
        category:            null,
        photoUrl:            a.holder_photo_url ?? null,
        wisselplaatPhotoUrl: a.holder_wisselplaat_photo_url ?? null,
        schroefOrderingCode: a.holder_schroef_ordering_code ?? null,
        schroefPhotoUrl:     a.holder_schroef_photo_url ?? null,
      })
    }

    for (const c of componentRows) {
      components.push({
        type:                'extension',
        position:            c.position,
        reach:               c.reach,
        name:                c.name,
        comment:             c.comment,
        orderingCode:        c.orderingCode,
        manufacturer:        c.manufacturer,
        category:            c.itemCategory,
        photoUrl:            c.photoUrl ?? null,
        wisselplaatPhotoUrl: c.wisselplaatPhotoUrl ?? null,
        schroefOrderingCode: c.schroefOrderingCode ?? null,
        schroefPhotoUrl:     c.schroefPhotoUrl ?? null,
      })
    }

    if (a.tool_name) {
      components.push({
        type:                'tool',
        position:            999,
        name:                a.tool_name,
        comment:             a.tool_comment,
        orderingCode:        a.tool_ordering,
        manufacturer:        a.tool_manufacturer,
        category:            a.tool_category,
        photoUrl:            a.tool_photo_url ?? null,
        wisselplaatPhotoUrl: a.tool_wisselplaat_photo_url ?? null,
        schroefOrderingCode: a.tool_schroef_ordering_code ?? null,
        schroefPhotoUrl:     a.tool_schroef_photo_url ?? null,
      })
    }

    return {
      assembly: {
        id:             a.id,
        ncNumber:       a.nc_number,
        ncName:         a.nc_name,
        comment:        a.comment,
        toolLength:     a.tool_length,
        presetDiameter: a.preset_diameter,
      },
      components,
      instances: instanceRows,
    }
  })

  // ── Component zoeken (where-used) ────────────────────────────────────────

  fastify.get('/kiosk/cnc/components', authRead, async (req) => {
    const { search } = req.query as { search?: string }
    const q = search?.trim() ?? ''

    const rows = await fastify.db.execute<{
      id: string
      item_type: string
      item_category: string | null
      name: string
      comment: string | null
      ordering_code: string | null
      manufacturer: string | null
      photo_url: string | null
      wisselplaat_photo_url: string | null
      schroef_ordering_code: string | null
      schroef_photo_url: string | null
      assembly_count: string
      machine_count: string
    }>(sql`
      SELECT
        i.id,
        i.item_type,
        i.item_category,
        i.name,
        i.comment,
        i.ordering_code,
        i.manufacturer,
        i.photo_url,
        i.wisselplaat_photo_url,
        i.schroef_ordering_code,
        i.schroef_photo_url,
        COUNT(DISTINCT agg.assembly_id)::text  AS assembly_count,
        COUNT(DISTINCT e.machine_id)::text     AS machine_count
      FROM tool_library_items i
      LEFT JOIN (
        SELECT tool_item_id   AS item_id, id AS assembly_id FROM tool_library_assemblies WHERE tool_item_id IS NOT NULL
        UNION ALL
        SELECT holder_item_id AS item_id, id AS assembly_id FROM tool_library_assemblies WHERE holder_item_id IS NOT NULL
        UNION ALL
        SELECT c.item_id, c.assembly_id FROM tool_library_assembly_components c
      ) agg ON agg.item_id = i.id
      LEFT JOIN tool_library_assemblies asm ON asm.id = agg.assembly_id
      LEFT JOIN cnc_tool_entries e ON e.name = asm.nc_name
      WHERE ${q ? sql`(i.name ILIKE ${'%' + q + '%'} OR i.comment ILIKE ${'%' + q + '%'})` : sql`TRUE`}
      GROUP BY i.id
      ORDER BY i.item_type ASC, i.name ASC
    `)

    return {
      items: rows.map(r => ({
        id:                  r.id,
        itemType:            r.item_type,
        itemCategory:        r.item_category,
        name:                r.name,
        comment:             r.comment,
        orderingCode:        r.ordering_code,
        manufacturer:        r.manufacturer,
        photoUrl:            r.photo_url ?? null,
        wisselplaatPhotoUrl: r.wisselplaat_photo_url ?? null,
        schroefOrderingCode: r.schroef_ordering_code ?? null,
        schroefPhotoUrl:     r.schroef_photo_url     ?? null,
        assemblyCount:       parseInt(r.assembly_count ?? '0', 10),
        machineCount:        parseInt(r.machine_count  ?? '0', 10),
      })),
    }
  })

  // ── Component detail (where-used volledig) ────────────────────────────────

  fastify.get('/kiosk/cnc/components/:itemId', authRead, async (req, reply) => {
    const { itemId } = req.params as { itemId: string }

    // Item ophalen
    const itemRows = await fastify.db
      .select()
      .from(toolLibraryItems)
      .where(eq(toolLibraryItems.id, itemId))
      .limit(1)
    if (!itemRows.length) return reply.status(404).send({ error: 'Component niet gevonden' })
    const item = itemRows[0]

    // Samenstellingen waarin dit item voorkomt (met rol)
    const usageRows = await fastify.db.execute<{
      assembly_id: string
      nc_number: number
      nc_name: string
      role: string
    }>(sql`
      SELECT a.id AS assembly_id, a.nc_number, a.nc_name, 'tool' AS role
        FROM tool_library_assemblies a WHERE a.tool_item_id = ${itemId}
      UNION ALL
      SELECT a.id AS assembly_id, a.nc_number, a.nc_name, 'holder' AS role
        FROM tool_library_assemblies a WHERE a.holder_item_id = ${itemId}
      UNION ALL
      SELECT a.id AS assembly_id, a.nc_number, a.nc_name, 'adapter' AS role
        FROM tool_library_assemblies a
        JOIN tool_library_assembly_components c ON c.assembly_id = a.id
        WHERE c.item_id = ${itemId}
      ORDER BY nc_number ASC
    `)

    // Instanties per samenstelling ophalen
    const ncNames = [...new Set(usageRows.map(r => r.nc_name))]
    let allInstances: Array<{
      ncName: string
      machineName: string
      toolNumber: number
      syncedAt: string
    }> = []

    if (ncNames.length > 0) {
      const instRows = await fastify.db
        .select({
          name:        cncToolEntries.name,
          toolNumber:  cncToolEntries.toolNumber,
          syncedAt:    cncToolEntries.syncedAt,
          machineName: machines.name,
        })
        .from(cncToolEntries)
        .innerJoin(machines, eq(cncToolEntries.machineId, machines.id))
        .where(inArray(cncToolEntries.name, ncNames))
        .orderBy(asc(machines.name), asc(cncToolEntries.toolNumber))

      allInstances = instRows.map(r => ({
        ncName:      r.name ?? '',
        machineName: r.machineName,
        toolNumber:  r.toolNumber,
        syncedAt:    r.syncedAt.toISOString(),
      }))
    }

    // Groepeer instanties per nc_name
    const instancesByNcName = new Map<string, typeof allInstances>()
    for (const inst of allInstances) {
      if (!instancesByNcName.has(inst.ncName)) instancesByNcName.set(inst.ncName, [])
      instancesByNcName.get(inst.ncName)!.push(inst)
    }

    return {
      item: {
        id:                  item.id,
        itemType:            item.itemType,
        itemCategory:        item.itemCategory,
        name:                item.name,
        comment:             item.comment,
        orderingCode:        item.orderingCode,
        manufacturer:        item.manufacturer,
        photoUrl:            item.photoUrl            ?? null,
        wisselplaatPhotoUrl: item.wisselplaatPhotoUrl  ?? null,
        schroefOrderingCode: item.schroefOrderingCode  ?? null,
        schroefPhotoUrl:     item.schroefPhotoUrl      ?? null,
      },
      assemblies: usageRows.map(r => ({
        assemblyId: r.assembly_id,
        ncNumber:   r.nc_number,
        ncName:     r.nc_name,
        role:       r.role,
        instances:  (instancesByNcName.get(r.nc_name) ?? []).map(i => ({
          machineName: i.machineName,
          toolNumber:  i.toolNumber,
          syncedAt:    i.syncedAt,
        })),
      })),
    }
  })

  // ── WinTool bibliotheek herladen via cnc-agent ───────────────────────────

  fastify.post('/admin/cnc/reload-tool-library', auth, async (_req, reply) => {
    let agentRes: Response
    try {
      agentRes = await callAgent('/sync-wintool', { method: 'POST' }, 120_000)
    } catch {
      return reply.status(502).send({ error: 'CNC-agent niet bereikbaar. Zorg dat de agent draait op de Windows machine.' })
    }

    const result = await agentRes.json().catch(() => ({})) as Record<string, unknown>
    if (!agentRes.ok) {
      return reply.status(502).send({ error: (result.error as string) ?? `Agent fout: HTTP ${agentRes.status}` })
    }
    return result
  })

  // ── WinTool bibliotheek herladen via bestand upload (cnc-agent) ──────────

  fastify.post('/admin/cnc/sync-wintool', auth, async (req, reply) => {
    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'Geen bestand ontvangen' })

    const tempFile = join(tmpdir(), `wintool-${randomUUID()}.db`)
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

    try {
      const chunks: Buffer[] = []
      for await (const chunk of data.file) chunks.push(chunk as Buffer)
      await writeFile(tempFile, Buffer.concat(chunks))

      const result = await importToolLibraryFromFile(tempFile, sql)
      await syncToolingArticles(fastify.db)
      return { ok: true, ...result }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Onbekende fout'
      return reply.status(500).send({ error: `Import mislukt: ${message}` })
    } finally {
      await sql.end()
      await unlink(tempFile).catch(() => {})
    }
  })

  // ── Component foto uploaden ───────────────────────────────────────────────

  fastify.post('/admin/cnc/components/:itemId/photo', auth, async (req, reply) => {
    const { itemId } = req.params as { itemId: string }

    const itemRows = await fastify.db
      .select({ id: toolLibraryItems.id })
      .from(toolLibraryItems)
      .where(eq(toolLibraryItems.id, itemId))
      .limit(1)
    if (!itemRows.length) return reply.status(404).send({ error: 'Component niet gevonden' })

    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'Geen bestand ontvangen' })

    const ext = extname(data.filename).toLowerCase()
    const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp'])
    if (!ALLOWED.has(ext)) {
      return reply.status(400).send({ error: 'Bestandstype niet toegestaan (jpg, png, webp)' })
    }

    const filename = `cnc-component-${itemId}-${Date.now()}${ext}`
    const dest = `/app/uploads/${filename}`

    const chunks: Buffer[] = []
    for await (const chunk of data.file) chunks.push(chunk as Buffer)
    await writeFile(dest, Buffer.concat(chunks))

    const photoUrl = `/uploads/${filename}`
    await fastify.db
      .update(toolLibraryItems)
      .set({ photoUrl })
      .where(eq(toolLibraryItems.id, itemId))

    return { photoUrl }
  })

  // ── Wisselplaat foto uploaden ─────────────────────────────────────────────

  fastify.post('/admin/cnc/components/:itemId/wisselplaat-photo', auth, async (req, reply) => {
    const { itemId } = req.params as { itemId: string }

    const itemRows = await fastify.db
      .select({ id: toolLibraryItems.id })
      .from(toolLibraryItems)
      .where(eq(toolLibraryItems.id, itemId))
      .limit(1)
    if (!itemRows.length) return reply.status(404).send({ error: 'Component niet gevonden' })

    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'Geen bestand ontvangen' })

    const ext = extname(data.filename).toLowerCase()
    const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp'])
    if (!ALLOWED.has(ext)) {
      return reply.status(400).send({ error: 'Bestandstype niet toegestaan (jpg, png, webp)' })
    }

    const filename = `cnc-wisselplaat-${itemId}-${Date.now()}${ext}`
    const dest = `/app/uploads/${filename}`

    const chunks: Buffer[] = []
    for await (const chunk of data.file) chunks.push(chunk as Buffer)
    await writeFile(dest, Buffer.concat(chunks))

    const wisselplaatPhotoUrl = `/uploads/${filename}`
    await fastify.db
      .update(toolLibraryItems)
      .set({ wisselplaatPhotoUrl })
      .where(eq(toolLibraryItems.id, itemId))

    return { wisselplaatPhotoUrl }
  })

  // ── Schroef artikelnummer opslaan ────────────────────────────────────────

  fastify.put('/admin/cnc/components/:itemId/schroef', authRead, async (req, reply) => {
    const { itemId } = req.params as { itemId: string }
    const { orderingCode } = req.body as { orderingCode: string | null }

    const itemRows = await fastify.db
      .select({ id: toolLibraryItems.id })
      .from(toolLibraryItems)
      .where(eq(toolLibraryItems.id, itemId))
      .limit(1)
    if (!itemRows.length) return reply.status(404).send({ error: 'Component niet gevonden' })

    await fastify.db
      .update(toolLibraryItems)
      .set({ schroefOrderingCode: orderingCode ?? null })
      .where(eq(toolLibraryItems.id, itemId))

    return { ok: true }
  })

  // ── Schroef foto uploaden ─────────────────────────────────────────────────

  fastify.post('/admin/cnc/components/:itemId/schroef-photo', authRead, async (req, reply) => {
    const { itemId } = req.params as { itemId: string }

    const itemRows = await fastify.db
      .select({ id: toolLibraryItems.id })
      .from(toolLibraryItems)
      .where(eq(toolLibraryItems.id, itemId))
      .limit(1)
    if (!itemRows.length) return reply.status(404).send({ error: 'Component niet gevonden' })

    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'Geen bestand ontvangen' })

    const ext = extname(data.filename).toLowerCase()
    const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp'])
    if (!ALLOWED.has(ext)) {
      return reply.status(400).send({ error: 'Bestandstype niet toegestaan (jpg, png, webp)' })
    }

    const filename = `cnc-schroef-${itemId}-${Date.now()}${ext}`
    const dest = `/app/uploads/${filename}`

    const chunks: Buffer[] = []
    for await (const chunk of data.file) chunks.push(chunk as Buffer)
    await writeFile(dest, Buffer.concat(chunks))

    const schroefPhotoUrl = `/uploads/${filename}`
    await fastify.db
      .update(toolLibraryItems)
      .set({ schroefPhotoUrl })
      .where(eq(toolLibraryItems.id, itemId))

    return { schroefPhotoUrl }
  })

  // ── Upload TOOL.T bestand ─────────────────────────────────────────────────

  fastify.post('/kiosk/cnc/machines/:id/upload-tool-file', authRead, async (req, reply) => {
    const { id } = req.params as { id: string }

    // Controleer machine bestaat
    const machineRows = await fastify.db
      .select({ id: machines.id, name: machines.name, toolTableFormat: machines.toolTableFormat })
      .from(machines)
      .where(eq(machines.id, id))
      .limit(1)
    if (!machineRows.length) return reply.status(404).send({ error: 'Machine niet gevonden' })

    const file = await req.file()
    if (!file) return reply.status(400).send({ error: 'Geen bestand ontvangen' })

    const fileName = file.filename
    const startedAt = Date.now()

    // Sync-log aanmaken (status: running)
    const [syncLog] = await fastify.db
      .insert(cncSyncLogs)
      .values({ machineId: id, status: 'running', fileName })
      .returning()

    try {
      // Bestand in-memory lezen
      const chunks: Buffer[] = []
      for await (const chunk of file.file) {
        chunks.push(chunk as Buffer)
      }
      const content = Buffer.concat(chunks).toString('utf-8')

      if (!content.trim()) {
        throw new Error('Bestand is leeg')
      }

      // Parsen
      const rawFmt = machineRows[0].toolTableFormat
      const fmt: ToolTableFormat = rawFmt === 'fooke' ? 'fooke' : rawFmt === 'ronin' ? 'ronin' : rawFmt === '3200' ? '3200' : rawFmt === 'portaal' ? 'portaal' : 'heidenhain'
      const { tools, summary } = parseToolTable(content, fmt)

      if (tools.length === 0) {
        throw new Error(
          `Geen geldige tools gevonden in het bestand. ${summary.skipped} regels overgeslagen, ${summary.errors} parse-fouten.`,
        )
      }

      // DB-transactie: verwijder oude entries, voeg nieuwe in
      await fastify.db.transaction(async (tx) => {
        await tx
          .delete(cncToolEntries)
          .where(eq(cncToolEntries.machineId, id))

        const now = new Date()
        await tx.insert(cncToolEntries).values(
          tools.map((t) => ({
            machineId:  id,
            toolNumber: t.toolNumber,
            name:       t.name,
            l:          t.l?.toString() ?? null,
            r:          t.r?.toString() ?? null,
            dl:         t.dl?.toString() ?? null,
            dr:         t.dr?.toString() ?? null,
            time2:      t.time2?.toString() ?? null,
            curTime:    t.curTime?.toString() ?? null,
            doc:        t.doc,
            locked:     t.locked,
            syncedAt:   now,
          })),
        )
      })

      const durationMs = Date.now() - startedAt

      // Sync-log bijwerken (success)
      await fastify.db
        .update(cncSyncLogs)
        .set({
          status:      'success',
          toolsCount:  tools.length,
          durationMs,
          completedAt: new Date(),
        })
        .where(eq(cncSyncLogs.id, syncLog.id))

      return {
        ok:         true,
        toolsCount: tools.length,
        summary,
        durationMs,
        syncLogId:  syncLog.id,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Onbekende fout'

      await fastify.db
        .update(cncSyncLogs)
        .set({
          status:       'error',
          errorMessage: message,
          durationMs:   Date.now() - startedAt,
          completedAt:  new Date(),
        })
        .where(eq(cncSyncLogs.id, syncLog.id))

      return reply.status(422).send({ error: message })
    }
  })
}
