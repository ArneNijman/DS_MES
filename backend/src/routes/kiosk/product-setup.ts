import { FastifyInstance } from 'fastify'
import { eq, desc, asc, ilike, or, and, sql, inArray, max } from 'drizzle-orm'
import { extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import {
  machines,
  employees,
  productSetups,
  productSetupSteps,
  productSetupNcFiles,
  productSetupToolCalls,
  productSetupDocuments,
  productSetupAttachments,
  cncToolEntries,
  toolLibraryAssemblies,
  toolLibraryItems,
  toolLibraryAssemblyComponents,
  toolingArticles,
  toolingStockLocations,
} from '../../db/schema.js'
import { parseNcProgram } from '../../cnc/ncProgramParser.js'

export async function productSetupRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  // ── Freesmachines ophalen ─────────────────────────────────────────────────

  fastify.get('/kiosk/product-setups/machines', auth, async () => {
    const rows = await fastify.db
      .select({
        id:        machines.id,
        machineId: machines.machineId,
        name:      machines.name,
        category:  machines.category,
        photoUrl:  machines.photoUrl,
        isActive:  machines.isActive,
        stepCount: sql<number>`(
          SELECT COUNT(*)::int FROM product_setup_steps s
          WHERE s.machine_id = ${machines.id}
        )`,
      })
      .from(machines)
      .where(eq(machines.category, 'Freesmachine'))
      .orderBy(machines.name)

    return rows
  })

  // ── Product-setups opzoeken (gefilterd op machine) ────────────────────────

  fastify.get('/kiosk/product-setups', auth, async (req) => {
    const { machineId, search } = req.query as { machineId?: string; search?: string }

    // Subquery: stap-aantallen per setup
    const baseQuery = fastify.db
      .select({
        id:                productSetups.id,
        productionOrderNo: productSetups.productionOrderNo,
        articleNo:         productSetups.articleNo,
        articleName:       productSetups.articleName,
        description:       productSetups.description,
        origin:            productSetups.origin,
        createdAt:         productSetups.createdAt,
        totalSteps:        sql<number>`(
          SELECT COUNT(*)::int FROM product_setup_steps s WHERE s.setup_id = ${productSetups.id}
        )`,
        stepsOnMachine:    machineId
          ? sql<number>`(
              SELECT COUNT(*)::int FROM product_setup_steps s
              WHERE s.setup_id = ${productSetups.id} AND s.machine_id = ${machineId}
            )`
          : sql<number>`0`,
      })
      .from(productSetups)

    const conditions: ReturnType<typeof eq>[] = []

    if (machineId) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM product_setup_steps s
          WHERE s.setup_id = ${productSetups.id} AND s.machine_id = ${machineId}
        )` as unknown as ReturnType<typeof eq>,
      )
    }

    if (search) {
      const q = `%${search}%`
      conditions.push(
        or(
          ilike(productSetups.articleName, q),
          ilike(productSetups.productionOrderNo, q),
          ilike(productSetups.articleNo, q),
          ilike(productSetups.description, q),
          sql`EXISTS (
            SELECT 1 FROM product_setup_steps s
            WHERE s.setup_id = ${productSetups.id} AND s.step_name ILIKE ${q}
          )` as unknown as ReturnType<typeof eq>,
        ) as unknown as ReturnType<typeof eq>,
      )
    }

    const rows = await (conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery
    ).orderBy(desc(productSetups.createdAt))

    return rows
  })

  // ── Nieuw product aanmaken ────────────────────────────────────────────────

  fastify.post('/kiosk/product-setups', auth, async (req, reply) => {
    const body = req.body as {
      articleName:       string
      productionOrderNo?: string
      articleNo?:         string
      description?:       string
      origin?:            string
    }

    if (!body.articleName?.trim()) {
      return reply.status(400).send({ error: 'Artikelnaam is verplicht' })
    }

    const [setup] = await fastify.db
      .insert(productSetups)
      .values({
        articleName:       body.articleName.trim(),
        productionOrderNo: body.productionOrderNo?.trim() || null,
        articleNo:         body.articleNo?.trim() || null,
        description:       body.description?.trim() || null,
        origin:            body.origin ?? 'manual',
        createdBy:         (req as any).employee?.employeeId ?? null,
      })
      .returning()

    return { ok: true, setupId: setup.id }
  })

  // ── Product-detail ophalen ────────────────────────────────────────────────

  fastify.get('/kiosk/product-setups/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }

    const [setup] = await fastify.db
      .select()
      .from(productSetups)
      .where(eq(productSetups.id, id))
      .limit(1)

    if (!setup) return reply.status(404).send({ error: 'Setup niet gevonden' })

    const steps = await fastify.db
      .select({
        id:              productSetupSteps.id,
        setupId:         productSetupSteps.setupId,
        stepNumber:      productSetupSteps.stepNumber,
        stepName:        productSetupSteps.stepName,
        machineId:       productSetupSteps.machineId,
        machineName:     machines.name,
        machinePhotoUrl: machines.photoUrl,
        zeroX:           productSetupSteps.zeroX,
        zeroY:           productSetupSteps.zeroY,
        zeroZ:           productSetupSteps.zeroZ,
        stepDescription: productSetupSteps.stepDescription,
        createdAt:       productSetupSteps.createdAt,
        updatedAt:       productSetupSteps.updatedAt,
      })
      .from(productSetupSteps)
      .leftJoin(machines, eq(machines.id, productSetupSteps.machineId))
      .where(eq(productSetupSteps.setupId, id))
      .orderBy(asc(productSetupSteps.stepNumber))

    // NC bestanden + tool calls per stap
    const stepIds = steps.map(s => s.id)
    const ncFiles = stepIds.length > 0
      ? await fastify.db
          .select()
          .from(productSetupNcFiles)
          .where(inArray(productSetupNcFiles.stepId, stepIds))
          .orderBy(asc(productSetupNcFiles.uploadedAt))
      : []

    const ncFileIds = ncFiles.map(f => f.id)
    const toolCalls = ncFileIds.length > 0
      ? await fastify.db
          .select()
          .from(productSetupToolCalls)
          .where(inArray(productSetupToolCalls.ncFileId, ncFileIds))
          .orderBy(asc(productSetupToolCalls.sequence))
      : []

    // Bijlagen per stap
    const attachments = stepIds.length > 0
      ? await fastify.db
          .select()
          .from(productSetupAttachments)
          .where(inArray(productSetupAttachments.stepId, stepIds))
          .orderBy(asc(productSetupAttachments.createdAt))
      : []

    // Tekeningen & CAD-bestanden op product-niveau
    const documents = await fastify.db
      .select({
        id:           productSetupDocuments.id,
        documentType: productSetupDocuments.documentType,
        fileUrl:      productSetupDocuments.fileUrl,
        fileName:     productSetupDocuments.fileName,
        versionNote:  productSetupDocuments.versionNote,
        mimeType:     productSetupDocuments.mimeType,
        uploadedAt:   productSetupDocuments.uploadedAt,
        uploadedByName: employees.name,
      })
      .from(productSetupDocuments)
      .leftJoin(employees, eq(employees.id, productSetupDocuments.uploadedBy))
      .where(eq(productSetupDocuments.setupId, id))
      .orderBy(desc(productSetupDocuments.uploadedAt))

    // Groepeer data per stap
    const stepsWithData = steps.map(step => ({
      ...step,
      ncFiles: ncFiles
        .filter(f => f.stepId === step.id)
        .map(f => ({
          ...f,
          toolCalls: toolCalls.filter(tc => tc.ncFileId === f.id),
        })),
      attachments: attachments.filter(a => a.stepId === step.id),
    }))

    return { ...setup, steps: stepsWithData, documents }
  })

  // ── Product updaten ───────────────────────────────────────────────────────

  fastify.patch('/kiosk/product-setups/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as {
      articleName?:       string
      productionOrderNo?: string
      articleNo?:         string
      description?:       string
    }

    const [updated] = await fastify.db
      .update(productSetups)
      .set({
        ...(body.articleName       !== undefined && { articleName:       body.articleName.trim() }),
        ...(body.productionOrderNo !== undefined && { productionOrderNo: body.productionOrderNo.trim() || null }),
        ...(body.articleNo         !== undefined && { articleNo:         body.articleNo.trim() || null }),
        ...(body.description       !== undefined && { description:       body.description.trim() || null }),
        updatedAt: new Date(),
      })
      .where(eq(productSetups.id, id))
      .returning()

    if (!updated) return reply.status(404).send({ error: 'Setup niet gevonden' })
    return { ok: true }
  })

  // ── Product verwijderen ───────────────────────────────────────────────────

  fastify.delete('/kiosk/product-setups/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    await fastify.db.delete(productSetups).where(eq(productSetups.id, id))
    return { ok: true }
  })

  // ── Nieuwe stap toevoegen ─────────────────────────────────────────────────

  fastify.post('/kiosk/product-setups/:id/steps', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as {
      stepName:    string
      machineId?:  string
    }

    if (!body.stepName?.trim()) {
      return reply.status(400).send({ error: 'Stapnaam is verplicht' })
    }

    const [maxRow] = await fastify.db
      .select({ maxStep: max(productSetupSteps.stepNumber) })
      .from(productSetupSteps)
      .where(eq(productSetupSteps.setupId, id))

    const nextNumber = (maxRow?.maxStep ?? 0) + 1

    const [step] = await fastify.db
      .insert(productSetupSteps)
      .values({
        setupId:    id,
        stepNumber: nextNumber,
        stepName:   body.stepName.trim(),
        machineId:  body.machineId || null,
      })
      .returning()

    return { ok: true, stepId: step.id, stepNumber: step.stepNumber }
  })

  // ── Stap updaten ──────────────────────────────────────────────────────────

  fastify.patch('/kiosk/product-setups/steps/:stepId', auth, async (req, reply) => {
    const { stepId } = req.params as { stepId: string }
    const body = req.body as {
      stepName?:        string
      machineId?:       string | null
      zeroX?:           number | null
      zeroY?:           number | null
      zeroZ?:           number | null
      stepDescription?: string | null
    }

    const [updated] = await fastify.db
      .update(productSetupSteps)
      .set({
        ...(body.stepName        !== undefined && { stepName:        body.stepName.trim() }),
        ...(body.machineId       !== undefined && { machineId:       body.machineId || null }),
        ...(body.zeroX           !== undefined && { zeroX:           body.zeroX?.toString() ?? null }),
        ...(body.zeroY           !== undefined && { zeroY:           body.zeroY?.toString() ?? null }),
        ...(body.zeroZ           !== undefined && { zeroZ:           body.zeroZ?.toString() ?? null }),
        ...(body.stepDescription !== undefined && { stepDescription: body.stepDescription || null }),
        updatedAt: new Date(),
      })
      .where(eq(productSetupSteps.id, stepId))
      .returning()

    if (!updated) return reply.status(404).send({ error: 'Stap niet gevonden' })
    return { ok: true }
  })

  // ── Stap verwijderen ──────────────────────────────────────────────────────

  fastify.delete('/kiosk/product-setups/steps/:stepId', auth, async (req, reply) => {
    const { stepId } = req.params as { stepId: string }
    await fastify.db.delete(productSetupSteps).where(eq(productSetupSteps.id, stepId))
    return { ok: true }
  })

  // ── .h bestand uploaden + parsen ─────────────────────────────────────────

  fastify.post('/kiosk/product-setups/steps/:stepId/nc-files', auth, async (req, reply) => {
    const { stepId } = req.params as { stepId: string }

    const [step] = await fastify.db
      .select({ id: productSetupSteps.id, machineId: productSetupSteps.machineId })
      .from(productSetupSteps)
      .where(eq(productSetupSteps.id, stepId))
      .limit(1)

    if (!step) return reply.status(404).send({ error: 'Stap niet gevonden' })

    const file = await req.file()
    if (!file) return reply.status(400).send({ error: 'Geen bestand ontvangen' })

    const ext = extname(file.filename).toLowerCase()
    if (ext !== '.h') {
      return reply.status(400).send({ error: 'Alleen .h bestanden zijn toegestaan' })
    }

    try {
      const chunks: Buffer[] = []
      for await (const chunk of file.file) chunks.push(chunk as Buffer)
      const content = Buffer.concat(chunks).toString('utf-8')

      if (!content.trim()) {
        return reply.status(422).send({ error: 'Bestand is leeg' })
      }

      const { programName, toolCalls, summary } = parseNcProgram(content)

      const [ncFile] = await fastify.db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(productSetupNcFiles)
          .values({
            stepId,
            fileName:      file.filename,
            programName:   programName ?? null,
            fileContent:   content,
            toolCallCount: toolCalls.length,
          })
          .returning()

        if (toolCalls.length > 0) {
          await tx.insert(productSetupToolCalls).values(
            toolCalls.map(tc => ({
              ncFileId:     inserted.id,
              sequence:     tc.sequence,
              toolNumber:   tc.toolNumber,
              toolName:     tc.toolName,
              axis:         tc.axis,
              spindleSpeed: tc.spindleSpeed,
              dl:           tc.dl?.toString() ?? null,
              dr:           tc.dr?.toString() ?? null,
            })),
          )
        }

        return [inserted]
      })

      return {
        ok:            true,
        ncFileId:      ncFile.id,
        programName:   programName ?? null,
        toolCallCount: toolCalls.length,
        summary,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Onbekende fout'
      return reply.status(422).send({ error: message })
    }
  })

  // ── Tool calls valideren tegen machinemagazijn ────────────────────────────

  fastify.get('/kiosk/product-setups/nc-files/:ncFileId/validate', auth, async (req, reply) => {
    const { ncFileId } = req.params as { ncFileId: string }

    const [ncFile] = await fastify.db
      .select({
        id:           productSetupNcFiles.id,
        programName:  productSetupNcFiles.programName,
        stepId:       productSetupNcFiles.stepId,
      })
      .from(productSetupNcFiles)
      .where(eq(productSetupNcFiles.id, ncFileId))
      .limit(1)

    if (!ncFile) return reply.status(404).send({ error: 'NC bestand niet gevonden' })

    const [step] = await fastify.db
      .select({
        machineId:   productSetupSteps.machineId,
        machineName: machines.name,
      })
      .from(productSetupSteps)
      .leftJoin(machines, eq(machines.id, productSetupSteps.machineId))
      .where(eq(productSetupSteps.id, ncFile.stepId))
      .limit(1)

    const machineId   = step?.machineId ?? null
    const machineName = step?.machineName ?? null

    // Tool calls laden
    const calls = await fastify.db
      .select()
      .from(productSetupToolCalls)
      .where(eq(productSetupToolCalls.ncFileId, ncFileId))
      .orderBy(asc(productSetupToolCalls.sequence))

    // Zonder machine: alles onbekend
    if (!machineId) {
      return {
        ncFileId,
        programName:  ncFile.programName,
        machineId:    null,
        machineName:  null,
        summary:      { total: calls.length, present: 0, missing: 0 },
        toolCalls:    calls.map(tc => ({
          sequence:     tc.sequence,
          toolNumber:   tc.toolNumber,
          toolName:     tc.toolName,
          axis:         tc.axis,
          spindleSpeed: tc.spindleSpeed,
          status:       'onbekend' as const,
        })),
      }
    }

    // Machinemagazijn laden
    const magazineEntries = await fastify.db
      .select()
      .from(cncToolEntries)
      .where(eq(cncToolEntries.machineId, machineId))

    const magazineByNumber = new Map(
      magazineEntries.filter(e => e.toolNumber != null).map(e => [e.toolNumber!, e]),
    )
    const magazineByName = new Map(
      magazineEntries.filter(e => e.name).map(e => [e.name!, e]),
    )

    // Assemblies ophalen voor aanwezige tools (één query, geen N+1)
    const presentNames = [
      ...new Set(
        calls
          .map(tc => {
            if (tc.toolNumber != null) return magazineByNumber.get(tc.toolNumber)?.name
            if (tc.toolName)           return magazineByName.get(tc.toolName)?.name
          })
          .filter((n): n is string => !!n),
      ),
    ]

    // assemblies + componenten in één query
    type AssemblyRow = {
      assemblyId:       string
      ncName:           string
      toolLength:       number | null
      presetDiameter:   number | null
      componentItemId:  string | null
      itemType:         string | null
      componentName:    string | null
      orderingCode:     string | null
      manufacturer:     string | null
      photoUrl:         string | null
      position:         number | null
      holderItemId:     string | null
      holderName:       string | null
      toolItemId:       string | null
      toolItemName:     string | null
    }

    let assemblyRows: AssemblyRow[] = []
    if (presentNames.length > 0) {
      assemblyRows = await fastify.db.execute(sql`
        SELECT
          a.id            AS "assemblyId",
          a.nc_name       AS "ncName",
          a.tool_length   AS "toolLength",
          a.preset_diameter AS "presetDiameter",
          ci.id           AS "componentItemId",
          ci.item_type    AS "itemType",
          ci.name         AS "componentName",
          ci.ordering_code AS "orderingCode",
          ci.manufacturer AS "manufacturer",
          ci.photo_url    AS "photoUrl",
          c.position      AS "position",
          hi.id           AS "holderItemId",
          hi.name         AS "holderName",
          ti.id           AS "toolItemId",
          ti.name         AS "toolItemName"
        FROM tool_library_assemblies a
        LEFT JOIN tool_library_assembly_components c ON c.assembly_id = a.id
        LEFT JOIN tool_library_items ci ON ci.id = c.item_id
        LEFT JOIN tool_library_items hi ON hi.id = a.holder_item_id
        LEFT JOIN tool_library_items ti ON ti.id = a.tool_item_id
        WHERE a.nc_name = ANY(${presentNames})
        ORDER BY a.nc_name, c.position
      `) as AssemblyRow[]
    }

    // Groepeer assembly-rijen per ncName
    const assemblyMap = new Map<string, {
      id: string; ncName: string; toolLength: number | null; presetDiameter: number | null
      components: { type: string; name: string; orderingCode: string | null; manufacturer: string | null; photoUrl: string | null }[]
    }>()
    for (const row of assemblyRows) {
      if (!assemblyMap.has(row.ncName)) {
        assemblyMap.set(row.ncName, {
          id:             row.assemblyId,
          ncName:         row.ncName,
          toolLength:     row.toolLength,
          presetDiameter: row.presetDiameter,
          components:     [],
        })
      }
      const asm = assemblyMap.get(row.ncName)!
      if (row.componentItemId && row.componentName) {
        asm.components.push({
          type:         row.itemType ?? 'overig',
          name:         row.componentName,
          orderingCode: row.orderingCode,
          manufacturer: row.manufacturer,
          photoUrl:     row.photoUrl,
        })
      }
    }

    // Ontbrekende tools: in welke andere machines + componenten op voorraad
    const missingNames = [
      ...new Set(
        calls
          .filter(tc => {
            if (tc.toolNumber === 0) return false
            if (tc.toolNumber != null) return !magazineByNumber.has(tc.toolNumber)
            if (tc.toolName)           return !magazineByName.has(tc.toolName)
            return true
          })
          .map(tc => tc.toolName ?? null)
          .filter((n): n is string => n !== null),
      ),
    ]

    // In welke machines zitten ontbrekende assemblies?
    type MachineInstanceRow = { machineName: string; machineId: string; toolNumber: number; ncName: string }
    let machineInstances: MachineInstanceRow[] = []
    if (missingNames.length > 0) {
      machineInstances = await fastify.db.execute(sql`
        SELECT m.name AS "machineName", m.id AS "machineId",
               e.tool_number AS "toolNumber", e.name AS "ncName"
        FROM cnc_tool_entries e
        JOIN machines m ON m.id = e.machine_id
        WHERE e.name = ANY(${missingNames})
          AND e.machine_id != ${machineId}
      `) as MachineInstanceRow[]
    }

    const machineInstancesByName = new Map<string, { machineId: string; machineName: string; toolNumber: number; count: number }[]>()
    for (const row of machineInstances) {
      if (!machineInstancesByName.has(row.ncName)) machineInstancesByName.set(row.ncName, [])
      const list = machineInstancesByName.get(row.ncName)!
      const existing = list.find(x => x.machineId === row.machineId)
      if (existing) {
        existing.count++
      } else {
        list.push({ machineId: row.machineId, machineName: row.machineName, toolNumber: row.toolNumber, count: 1 })
      }
    }

    // Componenten op voorraad voor ontbrekende assemblies
    // Zoek via: assembly → tool_item_id/holder_item_id → tooling_articles.source_item_id
    type StockRow = { ncName: string; itemId: string; itemName: string; itemType: string; locId: string; locationCode: string; quantity: number }
    let stockRows: StockRow[] = []
    if (missingNames.length > 0) {
      stockRows = await fastify.db.execute(sql`
        SELECT
          a.nc_name       AS "ncName",
          li.id           AS "itemId",
          li.name         AS "itemName",
          li.item_type    AS "itemType",
          sl.id           AS "locId",
          sl.location_code AS "locationCode",
          sl.quantity     AS "quantity"
        FROM tool_library_assemblies a
        JOIN tool_library_items li ON li.id = a.tool_item_id OR li.id = a.holder_item_id
        JOIN tooling_articles ta ON ta.source_item_id = li.id
        JOIN tooling_stock_locations sl ON sl.article_id = ta.id
        WHERE a.nc_name = ANY(${missingNames})
          AND sl.quantity > 0
        UNION ALL
        SELECT
          a.nc_name       AS "ncName",
          li.id           AS "itemId",
          li.name         AS "itemName",
          li.item_type    AS "itemType",
          sl.id           AS "locId",
          sl.location_code AS "locationCode",
          sl.quantity     AS "quantity"
        FROM tool_library_assemblies a
        JOIN tool_library_assembly_components c ON c.assembly_id = a.id
        JOIN tool_library_items li ON li.id = c.item_id
        JOIN tooling_articles ta ON ta.source_item_id = li.id
        JOIN tooling_stock_locations sl ON sl.article_id = ta.id
        WHERE a.nc_name = ANY(${missingNames})
          AND sl.quantity > 0
      `) as StockRow[]
    }

    const stockByName = new Map<string, { itemId: string; itemName: string; itemType: string; locations: { locId: string; locationCode: string; quantity: number }[] }[]>()
    for (const row of stockRows) {
      if (!stockByName.has(row.ncName)) stockByName.set(row.ncName, [])
      const list = stockByName.get(row.ncName)!
      let item = list.find(x => x.itemId === row.itemId)
      if (!item) {
        item = { itemId: row.itemId, itemName: row.itemName, itemType: row.itemType, locations: [] }
        list.push(item)
      }
      if (!item.locations.find(l => l.locId === row.locId)) {
        item.locations.push({ locId: row.locId, locationCode: row.locationCode, quantity: row.quantity })
      }
    }

    // Bouw validatie-resultaat
    let present = 0
    let missing = 0

    const resultCalls = calls.map(tc => {
      // Spindelstop
      if (tc.toolNumber === 0) {
        return { sequence: tc.sequence, toolNumber: tc.toolNumber, toolName: tc.toolName, axis: tc.axis, spindleSpeed: tc.spindleSpeed, status: 'onbekend' as const }
      }

      const entry = tc.toolNumber != null
        ? magazineByNumber.get(tc.toolNumber)
        : tc.toolName ? magazineByName.get(tc.toolName) : undefined

      if (entry) {
        present++
        const assembly = entry.name ? assemblyMap.get(entry.name) ?? null : null
        return {
          sequence:     tc.sequence,
          toolNumber:   tc.toolNumber,
          toolName:     tc.toolName,
          axis:         tc.axis,
          spindleSpeed: tc.spindleSpeed,
          status:       'aanwezig' as const,
          magazineEntry: {
            toolNumber: entry.toolNumber,
            name:       entry.name,
            l:          entry.l,
            r:          entry.r,
            dl:         entry.dl,
            dr:         entry.dr,
            time2:      entry.time2,
            curTime:    entry.curTime,
          },
          assembly,
        }
      } else {
        missing++
        const name = tc.toolName ?? null
        return {
          sequence:     tc.sequence,
          toolNumber:   tc.toolNumber,
          toolName:     tc.toolName,
          axis:         tc.axis,
          spindleSpeed: tc.spindleSpeed,
          status:       'ontbreekt' as const,
          inOtherMachines:   name ? (machineInstancesByName.get(name) ?? []) : [],
          componentsInStock: name ? (stockByName.get(name) ?? []) : [],
        }
      }
    })

    const uniqueTools = new Set(
      calls
        .filter(tc => tc.toolNumber !== 0)
        .map(tc => tc.toolNumber != null ? `T${tc.toolNumber}` : `N:${tc.toolName}`)
    ).size

    return {
      ncFileId,
      programName:  ncFile.programName,
      machineId,
      machineName,
      summary:      { total: uniqueTools, present, missing },
      toolCalls:    resultCalls,
    }
  })

  // ── NC bestand verwijderen ────────────────────────────────────────────────

  fastify.delete('/kiosk/product-setups/nc-files/:ncFileId', auth, async (req) => {
    const { ncFileId } = req.params as { ncFileId: string }
    await fastify.db.delete(productSetupNcFiles).where(eq(productSetupNcFiles.id, ncFileId))
    return { ok: true }
  })

  // ── Document (tekening/CAD) uploaden ─────────────────────────────────────

  fastify.post('/kiosk/product-setups/:id/documents', auth, async (req, reply) => {
    const { id } = req.params as { id: string }

    const parts = req.parts()
    let documentType = 'tekening'
    let versionNote: string | null = null
    let fileField: import('@fastify/multipart').MultipartFile | null = null

    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'documentType') documentType = part.value as string
        if (part.fieldname === 'versionNote')  versionNote = part.value as string || null
      } else if (part.type === 'file') {
        fileField = part
      }
    }

    if (!fileField) return reply.status(400).send({ error: 'Geen bestand ontvangen' })

    const ext = extname(fileField.filename).toLowerCase()
    const filename = `product-doc-${randomUUID()}${ext}`
    const dest = `/app/uploads/${filename}`

    await pipeline(fileField.file, createWriteStream(dest))

    const [doc] = await fastify.db
      .insert(productSetupDocuments)
      .values({
        setupId:      id,
        documentType,
        fileUrl:      `/uploads/${filename}`,
        fileName:     fileField.filename,
        versionNote,
        mimeType:     fileField.mimetype || null,
        uploadedBy:   (req as any).employee?.employeeId ?? null,
      })
      .returning()

    return { ok: true, documentId: doc.id, fileUrl: doc.fileUrl }
  })

  // ── Document­lijst ophalen ────────────────────────────────────────────────

  fastify.get('/kiosk/product-setups/:id/documents', auth, async (req) => {
    const { id } = req.params as { id: string }

    return fastify.db
      .select({
        id:             productSetupDocuments.id,
        documentType:   productSetupDocuments.documentType,
        fileUrl:        productSetupDocuments.fileUrl,
        fileName:       productSetupDocuments.fileName,
        versionNote:    productSetupDocuments.versionNote,
        mimeType:       productSetupDocuments.mimeType,
        uploadedAt:     productSetupDocuments.uploadedAt,
        uploadedByName: employees.name,
      })
      .from(productSetupDocuments)
      .leftJoin(employees, eq(employees.id, productSetupDocuments.uploadedBy))
      .where(eq(productSetupDocuments.setupId, id))
      .orderBy(productSetupDocuments.documentType, desc(productSetupDocuments.uploadedAt))
  })

  // ── Document versienota updaten ───────────────────────────────────────────

  fastify.patch('/kiosk/product-setups/documents/:docId', auth, async (req, reply) => {
    const { docId } = req.params as { docId: string }
    const { versionNote } = req.body as { versionNote?: string | null }

    const [updated] = await fastify.db
      .update(productSetupDocuments)
      .set({ versionNote: versionNote?.trim() || null })
      .where(eq(productSetupDocuments.id, docId))
      .returning()

    if (!updated) return reply.status(404).send({ error: 'Document niet gevonden' })
    return { ok: true }
  })

  // ── Document verwijderen ──────────────────────────────────────────────────

  fastify.delete('/kiosk/product-setups/documents/:docId', auth, async (req) => {
    const { docId } = req.params as { docId: string }
    await fastify.db.delete(productSetupDocuments).where(eq(productSetupDocuments.id, docId))
    return { ok: true }
  })

  // ── Bijlage uploaden (per stap) ───────────────────────────────────────────

  fastify.post('/kiosk/product-setups/steps/:stepId/attachments', auth, async (req, reply) => {
    const { stepId } = req.params as { stepId: string }

    const file = await req.file()
    if (!file) return reply.status(400).send({ error: 'Geen bestand ontvangen' })

    const ext = extname(file.filename).toLowerCase()
    const filename = `product-attachment-${randomUUID()}${ext}`
    const dest = `/app/uploads/${filename}`

    await pipeline(file.file, createWriteStream(dest))

    const [attachment] = await fastify.db
      .insert(productSetupAttachments)
      .values({
        stepId,
        fileUrl:  `/uploads/${filename}`,
        fileName: file.filename,
        mimeType: file.mimetype || null,
      })
      .returning()

    return { ok: true, attachmentId: attachment.id, fileUrl: attachment.fileUrl }
  })

  // ── Bijlage caption updaten ───────────────────────────────────────────────

  fastify.patch('/kiosk/product-setups/attachments/:attachId', auth, async (req, reply) => {
    const { attachId } = req.params as { attachId: string }
    const { caption } = req.body as { caption?: string }

    const [updated] = await fastify.db
      .update(productSetupAttachments)
      .set({ caption: caption?.trim() || null })
      .where(eq(productSetupAttachments.id, attachId))
      .returning()

    if (!updated) return reply.status(404).send({ error: 'Bijlage niet gevonden' })
    return { ok: true }
  })

  // ── Bijlage verwijderen ───────────────────────────────────────────────────

  fastify.delete('/kiosk/product-setups/attachments/:attachId', auth, async (req) => {
    const { attachId } = req.params as { attachId: string }
    await fastify.db.delete(productSetupAttachments).where(eq(productSetupAttachments.id, attachId))
    return { ok: true }
  })
}
