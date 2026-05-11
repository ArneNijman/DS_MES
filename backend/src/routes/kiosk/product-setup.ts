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
  cncSyncLogs,
  productSetupOverdracht,
  productSetupOverdrachtPhotos,
  toolLibraryAssemblies,
  toolLibraryItems,
  toolLibraryAssemblyComponents,
  toolingArticles,
  toolingStockLocations,
} from '../../db/schema.js'
import { parseNcProgram } from '../../cnc/ncProgramParser.js'
import { parsePcdmisXml } from '../../cnc/pcdmisParser.js'
import { readFile } from 'node:fs/promises'

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

    const conditions: ReturnType<typeof eq>[] = [
      eq(productSetups.setupType, 'product') as unknown as ReturnType<typeof eq>,
    ]

    if (machineId) {
      conditions.push(
        sql`(
          EXISTS (
            SELECT 1 FROM product_setup_steps s
            WHERE s.setup_id = ${productSetups.id} AND s.machine_id = ${machineId}
          )
          OR NOT EXISTS (
            SELECT 1 FROM product_setup_steps s
            WHERE s.setup_id = ${productSetups.id}
          )
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
      productionOrderNo: string
      articleNo?:        string
      description?:      string
      origin?:           string
    }

    if (!body.productionOrderNo?.trim()) {
      return reply.status(400).send({ error: 'Productieorder is verplicht' })
    }

    const rawEmployeeId = (req as any).employee?.employeeId ?? null
    let createdBy: string | null = null
    if (rawEmployeeId) {
      const [emp] = await fastify.db.select({ id: employees.id }).from(employees).where(eq(employees.id, rawEmployeeId)).limit(1)
      createdBy = emp?.id ?? null
    }

    const [setup] = await fastify.db
      .insert(productSetups)
      .values({
        productionOrderNo: body.productionOrderNo.trim(),
        articleNo:         body.articleNo?.trim() || null,
        description:       body.description?.trim() || null,
        origin:            body.origin ?? 'manual',
        setupType:         'product',
        createdBy,
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
        bewerkingNr:     productSetupSteps.bewerkingNr,
        stepName:        productSetupSteps.stepName,
        machineId:       productSetupSteps.machineId,
        machineName:     machines.name,
        machinePhotoUrl: machines.photoUrl,
        zeroX:           productSetupSteps.zeroX,
        zeroY:           productSetupSteps.zeroY,
        zeroZ:           productSetupSteps.zeroZ,
        stepDescription: productSetupSteps.stepDescription,
        opmerkingen:     productSetupSteps.opmerkingen,
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
      productionOrderNo?: string
      articleNo?:         string
      description?:       string
    }

    const [updated] = await fastify.db
      .update(productSetups)
      .set({
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
      stepName:     string
      bewerkingNr?: number | null
      machineId?:   string
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
        setupId:     id,
        stepNumber:  nextNumber,
        bewerkingNr: body.bewerkingNr ?? null,
        stepName:    body.stepName.trim(),
        machineId:   body.machineId || null,
      })
      .returning()

    return { ok: true, stepId: step.id, stepNumber: step.stepNumber }
  })

  // ── Stap updaten ──────────────────────────────────────────────────────────

  fastify.patch('/kiosk/product-setups/steps/:stepId', auth, async (req, reply) => {
    const { stepId } = req.params as { stepId: string }
    const body = req.body as {
      stepName?:        string
      bewerkingNr?:     number | null
      machineId?:       string | null
      zeroX?:           number | null
      zeroY?:           number | null
      zeroZ?:           number | null
      stepDescription?: string | null
      opmerkingen?:     string | null
    }

    const [updated] = await fastify.db
      .update(productSetupSteps)
      .set({
        ...(body.stepName        !== undefined && { stepName:        body.stepName.trim() }),
        ...(body.bewerkingNr     !== undefined && { bewerkingNr:     body.bewerkingNr ?? null }),
        ...(body.machineId       !== undefined && { machineId:       body.machineId || null }),
        ...(body.zeroX           !== undefined && { zeroX:           body.zeroX?.toString() ?? null }),
        ...(body.zeroY           !== undefined && { zeroY:           body.zeroY?.toString() ?? null }),
        ...(body.zeroZ           !== undefined && { zeroZ:           body.zeroZ?.toString() ?? null }),
        ...(body.stepDescription !== undefined && { stepDescription: body.stepDescription || null }),
        ...(body.opmerkingen     !== undefined && { opmerkingen:     body.opmerkingen || null }),
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

  // ── NC-bestand sturen naar machine via cnc-agent ─────────────────────────

  fastify.post('/kiosk/product-setups/steps/:stepId/nc-files/:ncFileId/send-to-machine', auth, async (req, reply) => {
    const { stepId, ncFileId } = req.params as { stepId: string; ncFileId: string }

    const [step] = await fastify.db
      .select({ id: productSetupSteps.id, machineId: productSetupSteps.machineId, bewerkingNr: productSetupSteps.bewerkingNr, setupId: productSetupSteps.setupId })
      .from(productSetupSteps)
      .where(eq(productSetupSteps.id, stepId))
      .limit(1)
    if (!step) return reply.status(404).send({ error: 'Stap niet gevonden' })
    if (!step.bewerkingNr) return reply.status(400).send({ error: 'Bewerkingstap heeft geen bewerkingsnummer' })
    if (!step.machineId)   return reply.status(400).send({ error: 'Geen machine gekoppeld aan stap' })

    const [setup] = await fastify.db
      .select({ articleNo: productSetups.articleNo })
      .from(productSetups)
      .where(eq(productSetups.id, step.setupId))
      .limit(1)
    if (!setup?.articleNo) return reply.status(400).send({ error: 'Setup heeft geen artikelnummer' })

    const [machine] = await fastify.db
      .select({ cncIpAddress: machines.cncIpAddress })
      .from(machines)
      .where(eq(machines.id, step.machineId))
      .limit(1)
    if (!machine?.cncIpAddress) return reply.status(400).send({ error: 'Machine heeft geen IP-adres' })

    const [ncFile] = await fastify.db
      .select({ fileName: productSetupNcFiles.fileName, fileContent: productSetupNcFiles.fileContent })
      .from(productSetupNcFiles)
      .where(eq(productSetupNcFiles.id, ncFileId))
      .limit(1)
    if (!ncFile) return reply.status(404).send({ error: 'NC-bestand niet gevonden' })

    const agentUrl = `http://host.docker.internal:${process.env.AGENT_PORT ?? 3099}/send-nc-file`
    let agentRes: Response
    try {
      agentRes = await fetch(agentUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ip:          machine.cncIpAddress,
          articleNo:   setup.articleNo,
          bewerkingNr: String(step.bewerkingNr),
          fileName:    ncFile.fileName,
          fileContent: ncFile.fileContent,
        }),
        signal: AbortSignal.timeout(60_000),
      })
    } catch (err: any) {
      return reply.status(502).send({ error: `CNC-agent niet bereikbaar: ${err.message}` })
    }

    const result = await agentRes.json().catch(() => ({}))
    if (!agentRes.ok) return reply.status(502).send({ error: result.error ?? 'Agent fout' })
    return result
  })

  // ── NC-bestand inhoud ophalen en bewerken ────────────────────────────────

  fastify.get('/kiosk/product-setups/nc-files/:ncFileId/content', auth, async (req, reply) => {
    const { ncFileId } = req.params as { ncFileId: string }
    const [ncFile] = await fastify.db
      .select({ fileContent: productSetupNcFiles.fileContent, fileName: productSetupNcFiles.fileName })
      .from(productSetupNcFiles)
      .where(eq(productSetupNcFiles.id, ncFileId))
      .limit(1)
    if (!ncFile) return reply.status(404).send({ error: 'NC-bestand niet gevonden' })
    return { fileContent: ncFile.fileContent, fileName: ncFile.fileName }
  })

  fastify.patch('/kiosk/product-setups/nc-files/:ncFileId/content', auth, async (req, reply) => {
    const { ncFileId } = req.params as { ncFileId: string }
    const { fileContent } = req.body as { fileContent: string }
    if (typeof fileContent !== 'string') return reply.status(400).send({ error: 'fileContent is verplicht' })

    const parsed   = parseNcProgram(fileContent)
    const [updated] = await fastify.db
      .update(productSetupNcFiles)
      .set({ fileContent, toolCallCount: parsed.toolCalls.length })
      .where(eq(productSetupNcFiles.id, ncFileId))
      .returning({ id: productSetupNcFiles.id, stepId: productSetupNcFiles.stepId })
    if (!updated) return reply.status(404).send({ error: 'NC-bestand niet gevonden' })

    // Tool calls opnieuw opslaan
    await fastify.db.delete(productSetupToolCalls).where(eq(productSetupToolCalls.ncFileId, ncFileId))
    if (parsed.toolCalls.length > 0) {
      await fastify.db.insert(productSetupToolCalls).values(
        parsed.toolCalls.map((tc, i) => ({
          ncFileId,
          sequence:      i + 1,
          toolNumber:    tc.toolNumber ?? null,
          toolName:      tc.toolName   ?? null,
          axis:          tc.axis       ?? null,
          spindleSpeed:  tc.spindleSpeed ?? null,
        }))
      )
    }
    return { ok: true }
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
        lastSyncAt:  null,
        validatedAt: new Date().toISOString(),
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
      magazineEntries.filter(e => e.name).map(e => [e.name!.toLowerCase(), e]),
    )

    // Assemblies ophalen voor aanwezige tools (één query, geen N+1)
    const presentNames = [
      ...new Set(
        calls
          .map(tc => {
            if (tc.toolNumber != null) return magazineByNumber.get(tc.toolNumber)?.name
            if (tc.toolName)           return magazineByName.get(tc.toolName.toLowerCase())?.name
          })
          .filter((n): n is string => !!n),
      ),
    ]

    // assemblies + componenten in één query (houder → tussenstukken → snijgereedschap)
    type AssemblyRow = {
      assemblyId:               string
      ncName:                   string
      toolLength:               number | null
      presetDiameter:           number | null
      // Tussenstukken (tool_library_assembly_components)
      componentItemId:          string | null
      componentName:            string | null
      componentComment:         string | null
      componentCategory:        string | null
      reach:                    number | null
      componentOrderingCode:    string | null
      componentManufacturer:    string | null
      componentPhotoUrl:        string | null
      componentWisselplaatPhotoUrl: string | null
      componentSchroefOrderingCode: string | null
      componentSchroefPhotoUrl: string | null
      position:                 number | null
      // Houder
      holderItemId:             string | null
      holderName:               string | null
      holderComment:            string | null
      holderOrderingCode:       string | null
      holderManufacturer:       string | null
      holderPhotoUrl:           string | null
      holderWisselplaatPhotoUrl: string | null
      holderSchroefOrderingCode: string | null
      holderSchroefPhotoUrl:    string | null
      // Snijgereedschap
      toolItemId:               string | null
      toolItemName:             string | null
      toolComment:              string | null
      toolCategory:             string | null
      toolOrderingCode:         string | null
      toolManufacturer:         string | null
      toolPhotoUrl:             string | null
      toolWisselplaatPhotoUrl:  string | null
      toolSchroefOrderingCode:  string | null
      toolSchroefPhotoUrl:      string | null
    }

    type AssemblyComponent = {
      itemId: string | null
      type: string; name: string; comment: string | null; category: string | null; reach: number | null
      orderingCode: string | null; manufacturer: string | null; photoUrl: string | null
      wisselplaatPhotoUrl: string | null; schroefOrderingCode: string | null; schroefPhotoUrl: string | null
    }

    type AssemblyEntry = {
      id: string; ncName: string; toolLength: number | null; presetDiameter: number | null
      components: AssemblyComponent[]
    }

    function buildAssemblyMap(rows: AssemblyRow[]): Map<string, AssemblyEntry> {
      // Groepeer rijen per ncName zodat we houder/tool eenmalig kunnen toevoegen
      const grouped = new Map<string, AssemblyRow[]>()
      for (const row of rows) {
        if (!grouped.has(row.ncName)) grouped.set(row.ncName, [])
        grouped.get(row.ncName)!.push(row)
      }

      const map = new Map<string, AssemblyEntry>()
      for (const [ncName, group] of grouped) {
        const first = group[0]
        const components: AssemblyComponent[] = []

        // 1. Houder
        if (first.holderItemId && first.holderName) {
          components.push({
            itemId: first.holderItemId,
            type: 'holder', name: first.holderName, comment: first.holderComment,
            category: null, reach: null,
            orderingCode: first.holderOrderingCode, manufacturer: first.holderManufacturer,
            photoUrl: first.holderPhotoUrl, wisselplaatPhotoUrl: first.holderWisselplaatPhotoUrl,
            schroefOrderingCode: first.holderSchroefOrderingCode, schroefPhotoUrl: first.holderSchroefPhotoUrl,
          })
        }

        // 2. Tussenstukken
        for (const row of group) {
          if (row.componentItemId && row.componentName) {
            components.push({
              itemId: row.componentItemId,
              type: 'extension', name: row.componentName, comment: row.componentComment,
              category: row.componentCategory, reach: row.reach,
              orderingCode: row.componentOrderingCode, manufacturer: row.componentManufacturer,
              photoUrl: row.componentPhotoUrl, wisselplaatPhotoUrl: row.componentWisselplaatPhotoUrl,
              schroefOrderingCode: row.componentSchroefOrderingCode, schroefPhotoUrl: row.componentSchroefPhotoUrl,
            })
          }
        }

        // 3. Snijgereedschap
        if (first.toolItemId && first.toolItemName) {
          components.push({
            itemId: first.toolItemId,
            type: 'tool', name: first.toolItemName, comment: first.toolComment,
            category: first.toolCategory, reach: null,
            orderingCode: first.toolOrderingCode, manufacturer: first.toolManufacturer,
            photoUrl: first.toolPhotoUrl, wisselplaatPhotoUrl: first.toolWisselplaatPhotoUrl,
            schroefOrderingCode: first.toolSchroefOrderingCode, schroefPhotoUrl: first.toolSchroefPhotoUrl,
          })
        }

        map.set(ncName, { id: first.assemblyId, ncName, toolLength: first.toolLength, presetDiameter: first.presetDiameter, components })
      }
      return map
    }

    async function fetchAssemblyRows(names: string[]): Promise<AssemblyRow[]> {
      return fastify.db.execute(sql`
        SELECT
          a.id                         AS "assemblyId",
          a.nc_name                    AS "ncName",
          a.tool_length                AS "toolLength",
          a.preset_diameter            AS "presetDiameter",
          ci.id                        AS "componentItemId",
          ci.name                      AS "componentName",
          ci.comment                   AS "componentComment",
          ci.item_category             AS "componentCategory",
          c.reach                      AS "reach",
          ci.ordering_code             AS "componentOrderingCode",
          ci.manufacturer              AS "componentManufacturer",
          ci.photo_url                 AS "componentPhotoUrl",
          ci.wisselplaat_photo_url     AS "componentWisselplaatPhotoUrl",
          ci.schroef_ordering_code     AS "componentSchroefOrderingCode",
          ci.schroef_photo_url         AS "componentSchroefPhotoUrl",
          c.position                   AS "position",
          hi.id                        AS "holderItemId",
          hi.name                      AS "holderName",
          hi.comment                   AS "holderComment",
          hi.ordering_code             AS "holderOrderingCode",
          hi.manufacturer              AS "holderManufacturer",
          hi.photo_url                 AS "holderPhotoUrl",
          hi.wisselplaat_photo_url     AS "holderWisselplaatPhotoUrl",
          hi.schroef_ordering_code     AS "holderSchroefOrderingCode",
          hi.schroef_photo_url         AS "holderSchroefPhotoUrl",
          ti.id                        AS "toolItemId",
          ti.name                      AS "toolItemName",
          ti.comment                   AS "toolComment",
          ti.item_category             AS "toolCategory",
          ti.ordering_code             AS "toolOrderingCode",
          ti.manufacturer              AS "toolManufacturer",
          ti.photo_url                 AS "toolPhotoUrl",
          ti.wisselplaat_photo_url     AS "toolWisselplaatPhotoUrl",
          ti.schroef_ordering_code     AS "toolSchroefOrderingCode",
          ti.schroef_photo_url         AS "toolSchroefPhotoUrl"
        FROM tool_library_assemblies a
        LEFT JOIN tool_library_assembly_components c ON c.assembly_id = a.id
        LEFT JOIN tool_library_items ci ON ci.id = c.item_id
        LEFT JOIN tool_library_items hi ON hi.id = a.holder_item_id
        LEFT JOIN tool_library_items ti ON ti.id = a.tool_item_id
        WHERE a.nc_name IN (${sql.join(names.map(n => sql`${n}`), sql`, `)})
        ORDER BY a.nc_name, c.position
      `) as unknown as AssemblyRow[]
    }

    let assemblyMap = new Map<string, AssemblyEntry>()
    if (presentNames.length > 0) {
      assemblyMap = buildAssemblyMap(await fetchAssemblyRows(presentNames))
    }

    // Ontbrekende tools: in welke andere machines + componenten op voorraad
    const missingNames = [
      ...new Set(
        calls
          .filter(tc => {
            if (tc.toolNumber === 0) return false
            if (tc.toolNumber != null) return !magazineByNumber.has(tc.toolNumber)
            if (tc.toolName)           return !magazineByName.has(tc.toolName.toLowerCase())
            return true
          })
          .map(tc => tc.toolName ?? null)
          .filter((n): n is string => n !== null),
      ),
    ]

    // Assemblies voor ontbrekende tools (zelfde structuur als present)
    let missingAssemblyMap = new Map<string, AssemblyEntry>()
    if (missingNames.length > 0) {
      missingAssemblyMap = buildAssemblyMap(await fetchAssemblyRows(missingNames))
    }

    // In welke machines zitten ontbrekende assemblies?
    type MachineInstanceRow = { machineName: string; machineId: string; toolNumber: number; ncName: string }
    let machineInstances: MachineInstanceRow[] = []
    if (missingNames.length > 0) {
      machineInstances = await fastify.db.execute(sql`
        SELECT m.name AS "machineName", m.id AS "machineId",
               e.tool_number AS "toolNumber", e.name AS "ncName"
        FROM cnc_tool_entries e
        JOIN machines m ON m.id = e.machine_id
        WHERE e.name IN (${sql.join(missingNames.map(n => sql`${n}`), sql`, `)})
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
        WHERE a.nc_name IN (${sql.join(missingNames.map(n => sql`${n}`), sql`, `)})
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
        WHERE a.nc_name IN (${sql.join(missingNames.map(n => sql`${n}`), sql`, `)})
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
        : tc.toolName ? magazineByName.get(tc.toolName.toLowerCase()) : undefined

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
            doc:        entry.doc,
            l:          entry.l,
            r:          entry.r,
            dl:         entry.dl,
            dr:         entry.dr,
            time2:      entry.time2,
            curTime:    entry.curTime,
            locked:     entry.locked,
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
          assembly:          name ? (missingAssemblyMap.get(name) ?? null) : null,
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

    const [lastSync] = await fastify.db
      .select({ completedAt: cncSyncLogs.completedAt })
      .from(cncSyncLogs)
      .where(and(eq(cncSyncLogs.machineId, machineId), eq(cncSyncLogs.status, 'success')))
      .orderBy(desc(cncSyncLogs.completedAt))
      .limit(1)

    return {
      ncFileId,
      programName:  ncFile.programName,
      machineId,
      machineName,
      summary:      { total: uniqueTools, present, missing },
      toolCalls:    resultCalls,
      lastSyncAt:   lastSync?.completedAt?.toISOString() ?? null,
      validatedAt:  new Date().toISOString(),
    }
  })

  // ── NC bestand hernoemen ─────────────────────────────────────────────────

  fastify.patch('/kiosk/product-setups/nc-files/:ncFileId', auth, async (req, reply) => {
    const { ncFileId } = req.params as { ncFileId: string }
    const { fileName } = req.body as { fileName?: string }
    if (!fileName?.trim()) return reply.status(400).send({ error: 'Bestandsnaam is verplicht' })
    await fastify.db
      .update(productSetupNcFiles)
      .set({ fileName: fileName.trim() })
      .where(eq(productSetupNcFiles.id, ncFileId))
    return { ok: true }
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

    const rawEmployeeId = (req as any).employee?.employeeId ?? null
    let savedUploadedBy: string | null = null
    if (rawEmployeeId) {
      const [emp] = await fastify.db.select({ id: employees.id }).from(employees).where(eq(employees.id, rawEmployeeId)).limit(1)
      savedUploadedBy = emp?.id ?? null
    }

    const parts = req.parts()
    let documentType = 'tekening'
    let versionNote: string | null = null
    let rapportageType: string | null = null
    let savedFileUrl: string | null = null
    let savedFileName: string | null = null
    let savedMimeType: string | null = null

    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'documentType')   documentType = part.value as string
        if (part.fieldname === 'versionNote')    versionNote = part.value as string || null
        if (part.fieldname === 'rapportageType') rapportageType = part.value as string || null
      } else if (part.type === 'file') {
        const ext      = extname(part.filename).toLowerCase()
        const filename = `product-doc-${randomUUID()}${ext}`
        const dest     = `/app/uploads/${filename}`
        await pipeline(part.file, createWriteStream(dest))
        savedFileUrl  = `/uploads/${filename}`
        savedFileName = part.filename
        savedMimeType = part.mimetype || null
      }
    }

    if (!savedFileUrl || !savedFileName) return reply.status(400).send({ error: 'Geen bestand ontvangen' })

    const [doc] = await fastify.db
      .insert(productSetupDocuments)
      .values({
        setupId:        id,
        documentType,
        fileUrl:        savedFileUrl,
        fileName:       savedFileName,
        versionNote,
        mimeType:       savedMimeType,
        rapportageType: rapportageType ?? null,
        uploadedBy:     savedUploadedBy,
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
        rapportageType: productSetupDocuments.rapportageType,
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

  // ── PC-DMIS XML parsen ────────────────────────────────────────────────────

  fastify.get('/kiosk/product-setups/documents/:docId/inspection-data', auth, async (req, reply) => {
    const { docId } = req.params as { docId: string }
    const [doc] = await fastify.db
      .select({ fileUrl: productSetupDocuments.fileUrl, documentType: productSetupDocuments.documentType })
      .from(productSetupDocuments)
      .where(eq(productSetupDocuments.id, docId))
      .limit(1)

    if (!doc) return reply.status(404).send({ error: 'Document niet gevonden' })
    if (doc.documentType !== 'meting_xml') return reply.status(400).send({ error: 'Geen XML meetbestand' })

    // fileUrl is "/uploads/product-doc-xxx.xml" → "/app/uploads/product-doc-xxx.xml"
    const localPath = `/app${doc.fileUrl}`
    let xml: string
    try {
      xml = await readFile(localPath, 'utf8')
    } catch {
      return reply.status(404).send({ error: 'Bestand niet gevonden op server' })
    }

    return parsePcdmisXml(xml)
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

  // ── Overdracht: entries ophalen (incl. foto's) ───────────────────────────

  fastify.get('/kiosk/product-setups/steps/:stepId/overdracht', auth, async (req) => {
    const { stepId } = req.params as { stepId: string }

    const entries = await fastify.db
      .select({
        id:            productSetupOverdracht.id,
        tekst:         productSetupOverdracht.tekst,
        createdByName: productSetupOverdracht.createdByName,
        createdAt:     productSetupOverdracht.createdAt,
      })
      .from(productSetupOverdracht)
      .where(eq(productSetupOverdracht.stepId, stepId))
      .orderBy(desc(productSetupOverdracht.createdAt))

    if (entries.length === 0) return []

    const photos = await fastify.db
      .select({
        id:           productSetupOverdrachtPhotos.id,
        overdrachtId: productSetupOverdrachtPhotos.overdrachtId,
        fileUrl:      productSetupOverdrachtPhotos.fileUrl,
        fileName:     productSetupOverdrachtPhotos.fileName,
      })
      .from(productSetupOverdrachtPhotos)
      .where(inArray(productSetupOverdrachtPhotos.overdrachtId, entries.map(e => e.id)))
      .orderBy(asc(productSetupOverdrachtPhotos.createdAt))

    return entries.map(e => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
      photos: photos.filter(p => p.overdrachtId === e.id),
    }))
  })

  // ── Overdracht: entry toevoegen ───────────────────────────────────────────

  fastify.post('/kiosk/product-setups/steps/:stepId/overdracht', auth, async (req, reply) => {
    const { stepId } = req.params as { stepId: string }
    const { tekst }  = req.body as { tekst?: string }
    if (!tekst?.trim()) return reply.status(400).send({ error: 'Tekst is verplicht' })

    const rawId: string | null = (req as any).employee?.employeeId ?? null
    let employeeId: string | null = null
    let createdByName: string | null = null
    if (rawId) {
      const [emp] = await fastify.db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(eq(employees.id, rawId))
        .limit(1)
      employeeId    = emp?.id   ?? null
      createdByName = emp?.name ?? null
    }

    const [entry] = await fastify.db
      .insert(productSetupOverdracht)
      .values({ stepId, tekst: tekst.trim(), createdBy: employeeId, createdByName })
      .returning()

    return { ok: true, id: entry.id }
  })

  // ── Overdracht: entry bewerken ────────────────────────────────────────────

  fastify.patch('/kiosk/product-setups/overdracht/:overdrachtId', auth, async (req, reply) => {
    const { overdrachtId } = req.params as { overdrachtId: string }
    const { tekst } = req.body as { tekst?: string }
    if (!tekst?.trim()) return reply.status(400).send({ error: 'Tekst is verplicht' })
    await fastify.db
      .update(productSetupOverdracht)
      .set({ tekst: tekst.trim() })
      .where(eq(productSetupOverdracht.id, overdrachtId))
    return { ok: true }
  })

  // ── Overdracht: entry verwijderen ─────────────────────────────────────────

  fastify.delete('/kiosk/product-setups/overdracht/:overdrachtId', auth, async (req) => {
    const { overdrachtId } = req.params as { overdrachtId: string }
    await fastify.db.delete(productSetupOverdracht).where(eq(productSetupOverdracht.id, overdrachtId))
    return { ok: true }
  })

  // ── Overdracht: foto uploaden ─────────────────────────────────────────────

  fastify.post('/kiosk/product-setups/overdracht/:overdrachtId/photos', auth, async (req, reply) => {
    const { overdrachtId } = req.params as { overdrachtId: string }

    const parts = req.parts()
    let savedFileUrl: string | null = null
    let savedFileName: string | null = null
    for await (const part of parts) {
      if (part.type === 'file') {
        const ext      = extname(part.filename) || '.jpg'
        const filename = `${randomUUID()}${ext}`
        const dest     = `/app/uploads/${filename}`
        await pipeline(part.file, createWriteStream(dest))
        savedFileUrl  = `/uploads/${filename}`
        savedFileName = part.filename
      }
    }
    if (!savedFileUrl || !savedFileName) return reply.status(400).send({ error: 'Geen bestand ontvangen' })

    const [photo] = await fastify.db
      .insert(productSetupOverdrachtPhotos)
      .values({ overdrachtId, fileUrl: savedFileUrl, fileName: savedFileName })
      .returning()

    return { ok: true, photoId: photo.id, fileUrl: photo.fileUrl }
  })

  // ── Overdracht: foto verwijderen ──────────────────────────────────────────

  fastify.delete('/kiosk/product-setups/overdracht-photos/:photoId', auth, async (req) => {
    const { photoId } = req.params as { photoId: string }
    await fastify.db.delete(productSetupOverdrachtPhotos).where(eq(productSetupOverdrachtPhotos.id, photoId))
    return { ok: true }
  })
}
