import { FastifyInstance } from 'fastify'
import { eq, desc, asc, ilike, or, and, sql, inArray, max } from 'drizzle-orm'
import { extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { readFile } from 'node:fs/promises'
import {
  machines,
  employees,
  productSetups,
  productSetupSteps,
  productSetupDocuments,
  productSetupAttachments,
  productSetupOverdracht,
  productSetupOverdrachtPhotos,
} from '../../db/schema.js'
import { parsePcdmisXml } from '../../cnc/pcdmisParser.js'

export async function meetSetupRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  // ── 3D-meetapparaten ophalen ──────────────────────────────────────────────

  fastify.get('/kiosk/meet-setups/machines', auth, async () => {
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
      .where(eq(machines.category, '3D-meetapparaat'))
      .orderBy(machines.name)

    return rows
  })

  // ── Meet-setups opzoeken ──────────────────────────────────────────────────

  fastify.get('/kiosk/meet-setups', auth, async (req) => {
    const { machineId, search } = req.query as { machineId?: string; search?: string }

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
      eq(productSetups.setupType, 'meet') as unknown as ReturnType<typeof eq>,
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

  // ── Nieuw meet-setup aanmaken ─────────────────────────────────────────────

  fastify.post('/kiosk/meet-setups', auth, async (req, reply) => {
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
        setupType:         'meet',
        createdBy,
      })
      .returning()

    return { ok: true, setupId: setup.id }
  })

  // ── Meet-setup detail ophalen ─────────────────────────────────────────────

  fastify.get('/kiosk/meet-setups/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }

    const [setup] = await fastify.db
      .select()
      .from(productSetups)
      .where(and(eq(productSetups.id, id), eq(productSetups.setupType, 'meet')))
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

    const stepIds = steps.map(s => s.id)

    const attachments = stepIds.length > 0
      ? await fastify.db
          .select()
          .from(productSetupAttachments)
          .where(inArray(productSetupAttachments.stepId, stepIds))
          .orderBy(asc(productSetupAttachments.createdAt))
      : []

    const documents = await fastify.db
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
      .orderBy(desc(productSetupDocuments.uploadedAt))

    const stepsWithData = steps.map(step => ({
      ...step,
      attachments: attachments.filter(a => a.stepId === step.id),
    }))

    return { ...setup, steps: stepsWithData, documents }
  })

  // ── Meet-setup updaten ────────────────────────────────────────────────────

  fastify.patch('/kiosk/meet-setups/:id', auth, async (req, reply) => {
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
      .where(and(eq(productSetups.id, id), eq(productSetups.setupType, 'meet')))
      .returning()

    if (!updated) return reply.status(404).send({ error: 'Setup niet gevonden' })
    return { ok: true }
  })

  // ── Meet-setup verwijderen ────────────────────────────────────────────────

  fastify.delete('/kiosk/meet-setups/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    await fastify.db.delete(productSetups).where(and(eq(productSetups.id, id), eq(productSetups.setupType, 'meet')))
    return { ok: true }
  })

  // ── Nieuwe stap toevoegen ─────────────────────────────────────────────────

  fastify.post('/kiosk/meet-setups/:id/steps', auth, async (req, reply) => {
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

  fastify.patch('/kiosk/meet-setups/steps/:stepId', auth, async (req, reply) => {
    const { stepId } = req.params as { stepId: string }
    const body = req.body as {
      stepName?:        string
      bewerkingNr?:     number | null
      machineId?:       string | null
      zeroX?:           string | null
      zeroY?:           string | null
      zeroZ?:           string | null
      stepDescription?: string | null
      opmerkingen?:     string | null
    }

    const [updated] = await fastify.db
      .update(productSetupSteps)
      .set({
        ...(body.stepName        !== undefined && { stepName:        body.stepName.trim() }),
        ...(body.bewerkingNr     !== undefined && { bewerkingNr:     body.bewerkingNr ?? null }),
        ...(body.machineId       !== undefined && { machineId:       body.machineId || null }),
        ...(body.zeroX           !== undefined && { zeroX:           body.zeroX ?? null }),
        ...(body.zeroY           !== undefined && { zeroY:           body.zeroY ?? null }),
        ...(body.zeroZ           !== undefined && { zeroZ:           body.zeroZ ?? null }),
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

  fastify.delete('/kiosk/meet-setups/steps/:stepId', auth, async (req, reply) => {
    const { stepId } = req.params as { stepId: string }
    await fastify.db.delete(productSetupSteps).where(eq(productSetupSteps.id, stepId))
    return { ok: true }
  })

  // ── Document uploaden ─────────────────────────────────────────────────────

  fastify.post('/kiosk/meet-setups/:id/documents', auth, async (req, reply) => {
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
        const filename = `meet-doc-${randomUUID()}${ext}`
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

  // ── Documentlijst ophalen ─────────────────────────────────────────────────

  fastify.get('/kiosk/meet-setups/:id/documents', auth, async (req) => {
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

  fastify.patch('/kiosk/meet-setups/documents/:docId', auth, async (req, reply) => {
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

  fastify.get('/kiosk/meet-setups/documents/:docId/inspection-data', auth, async (req, reply) => {
    const { docId } = req.params as { docId: string }
    const [doc] = await fastify.db
      .select({ fileUrl: productSetupDocuments.fileUrl, documentType: productSetupDocuments.documentType })
      .from(productSetupDocuments)
      .where(eq(productSetupDocuments.id, docId))
      .limit(1)

    if (!doc) return reply.status(404).send({ error: 'Document niet gevonden' })
    if (doc.documentType !== 'meting_xml') return reply.status(400).send({ error: 'Geen XML meetbestand' })

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

  fastify.delete('/kiosk/meet-setups/documents/:docId', auth, async (req) => {
    const { docId } = req.params as { docId: string }
    await fastify.db.delete(productSetupDocuments).where(eq(productSetupDocuments.id, docId))
    return { ok: true }
  })

  // ── Bijlage uploaden (per stap) ───────────────────────────────────────────

  fastify.post('/kiosk/meet-setups/steps/:stepId/attachments', auth, async (req, reply) => {
    const { stepId } = req.params as { stepId: string }

    const file = await req.file()
    if (!file) return reply.status(400).send({ error: 'Geen bestand ontvangen' })

    const ext = extname(file.filename).toLowerCase()
    const filename = `meet-attachment-${randomUUID()}${ext}`
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

  fastify.patch('/kiosk/meet-setups/attachments/:attachId', auth, async (req, reply) => {
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

  fastify.delete('/kiosk/meet-setups/attachments/:attachId', auth, async (req) => {
    const { attachId } = req.params as { attachId: string }
    await fastify.db.delete(productSetupAttachments).where(eq(productSetupAttachments.id, attachId))
    return { ok: true }
  })

  // ── Overdracht: entries ophalen ───────────────────────────────────────────

  fastify.get('/kiosk/meet-setups/steps/:stepId/overdracht', auth, async (req) => {
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

  fastify.post('/kiosk/meet-setups/steps/:stepId/overdracht', auth, async (req, reply) => {
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

  fastify.patch('/kiosk/meet-setups/overdracht/:overdrachtId', auth, async (req, reply) => {
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

  fastify.delete('/kiosk/meet-setups/overdracht/:overdrachtId', auth, async (req) => {
    const { overdrachtId } = req.params as { overdrachtId: string }
    await fastify.db.delete(productSetupOverdracht).where(eq(productSetupOverdracht.id, overdrachtId))
    return { ok: true }
  })

  // ── Overdracht: foto uploaden ─────────────────────────────────────────────

  fastify.post('/kiosk/meet-setups/overdracht/:overdrachtId/photos', auth, async (req, reply) => {
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

  fastify.delete('/kiosk/meet-setups/overdracht-photos/:photoId', auth, async (req) => {
    const { photoId } = req.params as { photoId: string }
    await fastify.db.delete(productSetupOverdrachtPhotos).where(eq(productSetupOverdrachtPhotos.id, photoId))
    return { ok: true }
  })
}
