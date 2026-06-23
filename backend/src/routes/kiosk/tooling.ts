import { FastifyInstance } from 'fastify'
import { eq, desc, ilike, or, sql, and, asc, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { extname } from 'node:path'
import { writeFile } from 'node:fs/promises'
import {
  toolingArticles,
  toolingStockLocations,
  toolingMutations,
  toolingFavorites,
  employees,
  toolLibraryAssemblies,
  toolLibraryItems,
  toolLibraryAssemblyComponents,
} from '../../db/schema.js'

// Types die afgeleid worden van een tool_library_item (niet WP-gerelateerd)
const TOOL_TYPES = new Set(['frees', 'boor', 'tap', 'uitboorder', 'ruimer', 'overig'])
const HOLDER_TYPES = new Set(['holder', 'extension'])

export async function kioskToolingRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  // ── Artikel-lijst (met totalStock via subquery) ────────────────────────────

  fastify.get('/kiosk/tooling/articles', auth, async (req) => {
    const { search, type } = req.query as { search?: string; type?: string }

    const conditions = []
    if (search) {
      conditions.push(
        or(
          ilike(toolingArticles.name, `%${search}%`),
          ilike(toolingArticles.orderingCode, `%${search}%`),
          ilike(toolingArticles.manufacturer, `%${search}%`),
        ),
      )
    }
    if (type && type !== 'all') {
      conditions.push(eq(toolingArticles.articleType, type))
    }

    const rows = await fastify.db
      .select({
        id:           toolingArticles.id,
        articleType:  toolingArticles.articleType,
        name:         toolingArticles.name,
        orderingCode: toolingArticles.orderingCode,
        manufacturer: toolingArticles.manufacturer,
        photoUrl:     toolingArticles.photoUrl,
        totalStock:   sql<number>`COALESCE(SUM(${toolingStockLocations.quantity}), 0)`,
      })
      .from(toolingArticles)
      .leftJoin(toolingStockLocations, eq(toolingStockLocations.articleId, toolingArticles.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(toolingArticles.id)
      .orderBy(toolingArticles.articleType, toolingArticles.name)

    return rows
  })

  // ── Artikel-detail (locaties + mutaties + gerelateerde) ───────────────────

  fastify.get('/kiosk/tooling/articles/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }

    const [article] = await fastify.db
      .select()
      .from(toolingArticles)
      .where(eq(toolingArticles.id, id))
      .limit(1)

    if (!article) return reply.status(404).send({ error: 'Artikel niet gevonden' })

    let libraryPhotoUrl: string | null = null
    if (article.sourceItemId) {
      const [libItem] = await fastify.db
        .select({ photoUrl: toolLibraryItems.photoUrl })
        .from(toolLibraryItems)
        .where(eq(toolLibraryItems.id, article.sourceItemId))
        .limit(1)
      libraryPhotoUrl = libItem?.photoUrl ?? null
    }

    const locations = await fastify.db
      .select()
      .from(toolingStockLocations)
      .where(eq(toolingStockLocations.articleId, id))
      .orderBy(toolingStockLocations.locationCode)

    const mutationRows = await fastify.db
      .select({
        id:            toolingMutations.id,
        locationCode:  toolingMutations.locationCode,
        quantityDelta: toolingMutations.quantityDelta,
        createdAt:     toolingMutations.createdAt,
        employeeName:  employees.name,
        lade:          toolingStockLocations.lade,
        vak:           toolingStockLocations.vak,
      })
      .from(toolingMutations)
      .leftJoin(employees, eq(employees.id, toolingMutations.employeeId))
      .leftJoin(
        toolingStockLocations,
        and(
          eq(toolingStockLocations.articleId, toolingMutations.articleId),
          eq(toolingStockLocations.locationCode, toolingMutations.locationCode),
        ),
      )
      .where(eq(toolingMutations.articleId, id))
      .orderBy(desc(toolingMutations.createdAt))
      .limit(20)

    // Gerelateerde artikelen (zelfde source_item_id — voor WP-tools: body/wisselplaat/schroef)
    const related = article.sourceItemId
      ? await fastify.db
          .select({
            id:           toolingArticles.id,
            articleType:  toolingArticles.articleType,
            name:         toolingArticles.name,
            photoUrl:     toolingArticles.photoUrl,
            totalStock:   sql<number>`COALESCE(SUM(${toolingStockLocations.quantity}), 0)`,
          })
          .from(toolingArticles)
          .leftJoin(toolingStockLocations, eq(toolingStockLocations.articleId, toolingArticles.id))
          .where(
            and(
              eq(toolingArticles.sourceItemId, article.sourceItemId),
              sql`${toolingArticles.id} != ${id}::uuid`,
            ),
          )
          .groupBy(toolingArticles.id)
          .limit(5)
      : []

    // Assembly-relaties (samenstellingen) via tool_library_assemblies
    // Voor tools: zoek samenstellingen waar dit de tool is → toon de houder
    // Voor houders: zoek samenstellingen waar dit de houder is → toon de tool
    let assemblies: { ncNumber: number; ncName: string; partnerName: string; partnerType: string }[] = []

    if (article.sourceItemId) {
      if (TOOL_TYPES.has(article.articleType)) {
        // Dit is een tool → zoek samenstellingen en toon de bijbehorende houder
        const rows = await fastify.db
          .select({
            ncNumber:    toolLibraryAssemblies.ncNumber,
            ncName:      toolLibraryAssemblies.ncName,
            partnerName: toolLibraryItems.name,
          })
          .from(toolLibraryAssemblies)
          .innerJoin(toolLibraryItems, eq(toolLibraryItems.id, toolLibraryAssemblies.holderItemId))
          .where(eq(toolLibraryAssemblies.toolItemId, article.sourceItemId))
          .orderBy(toolLibraryAssemblies.ncName)
          .limit(10)
        assemblies = rows.map((r) => ({ ...r, partnerType: 'holder' }))
      } else if (HOLDER_TYPES.has(article.articleType)) {
        // Dit is een houder → zoek samenstellingen en toon de bijbehorende tool
        const rows = await fastify.db
          .select({
            ncNumber:    toolLibraryAssemblies.ncNumber,
            ncName:      toolLibraryAssemblies.ncName,
            partnerName: toolLibraryItems.name,
          })
          .from(toolLibraryAssemblies)
          .innerJoin(toolLibraryItems, eq(toolLibraryItems.id, toolLibraryAssemblies.toolItemId))
          .where(eq(toolLibraryAssemblies.holderItemId, article.sourceItemId))
          .orderBy(toolLibraryAssemblies.ncName)
          .limit(10)
        assemblies = rows.map((r) => ({ ...r, partnerType: 'tool' }))
      }
    }

    return { article: { ...article, libraryPhotoUrl }, locations, mutations: mutationRows, related, assemblies }
  })

  // ── Artikel foto uploaden ─────────────────────────────────────────────────

  fastify.post('/kiosk/tooling/articles/:id/photo', auth, async (req, reply) => {
    const { id } = req.params as { id: string }

    const [article] = await fastify.db
      .select({ id: toolingArticles.id })
      .from(toolingArticles)
      .where(eq(toolingArticles.id, id))
      .limit(1)
    if (!article) return reply.status(404).send({ error: 'Artikel niet gevonden' })

    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'Geen bestand ontvangen' })

    const ext = extname(data.filename).toLowerCase()
    const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp'])
    if (!ALLOWED.has(ext)) return reply.status(400).send({ error: 'Alleen jpg, png en webp toegestaan' })

    const filename = `tooling-article-${id}-${Date.now()}${ext}`
    const dest = `/app/uploads/${filename}`
    const chunks: Buffer[] = []
    for await (const chunk of data.file) chunks.push(chunk as Buffer)
    await writeFile(dest, Buffer.concat(chunks))

    const photoUrl = `/uploads/${filename}`
    await fastify.db.update(toolingArticles).set({ photoUrl }).where(eq(toolingArticles.id, id))
    return { photoUrl }
  })

  // ── Locatie toevoegen ──────────────────────────────────────────────────────

  fastify.post('/kiosk/tooling/articles/:id/locations', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({
      locationCode: z.string().min(1).max(100),
      lade: z.string().max(50).optional(),
      vak:  z.string().max(50).optional(),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige locatiecode' })

    const [article] = await fastify.db
      .select({ id: toolingArticles.id })
      .from(toolingArticles)
      .where(eq(toolingArticles.id, id))
      .limit(1)
    if (!article) return reply.status(404).send({ error: 'Artikel niet gevonden' })

    const [loc] = await fastify.db
      .insert(toolingStockLocations)
      .values({
        articleId:    id,
        locationCode: body.data.locationCode,
        lade:         body.data.lade ?? null,
        vak:          body.data.vak  ?? null,
        quantity:     0,
      })
      .onConflictDoNothing()
      .returning()

    if (!loc) return reply.status(409).send({ error: 'Locatie bestaat al' })
    return loc
  })

  // ── Locatie lade/vak bijwerken ─────────────────────────────────────────────

  fastify.patch('/kiosk/tooling/stock-locations/:locId', auth, async (req, reply) => {
    const { locId } = req.params as { locId: string }
    const body = z.object({
      lade: z.string().max(50).nullable().optional(),
      vak:  z.string().max(50).nullable().optional(),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige waarden' })

    await fastify.db
      .update(toolingStockLocations)
      .set({
        ...(body.data.lade !== undefined ? { lade: body.data.lade || null } : {}),
        ...(body.data.vak  !== undefined ? { vak:  body.data.vak  || null } : {}),
      })
      .where(eq(toolingStockLocations.id, locId))
    return { ok: true }
  })

  // ── Locatie verwijderen ────────────────────────────────────────────────────

  fastify.delete('/kiosk/tooling/stock-locations/:locId', auth, async (req, reply) => {
    const { locId } = req.params as { locId: string }
    await fastify.db.delete(toolingStockLocations).where(eq(toolingStockLocations.id, locId))
    return { ok: true }
  })

  // ── Mutatie (+/-) ──────────────────────────────────────────────────────────

  fastify.post('/kiosk/tooling/stock-locations/:locId/mutate', auth, async (req, reply) => {
    const { locId } = req.params as { locId: string }
    const body = z.object({ delta: z.number().int().min(-9999).max(9999) }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldig delta-getal' })

    const employee = req.employee!

    const [loc] = await fastify.db
      .select()
      .from(toolingStockLocations)
      .where(eq(toolingStockLocations.id, locId))
      .limit(1)
    if (!loc) return reply.status(404).send({ error: 'Locatie niet gevonden' })

    const newQty = loc.quantity + body.data.delta
    if (newQty < 0) return reply.status(400).send({ error: 'Voorraad kan niet negatief worden' })

    const [updated] = await fastify.db
      .update(toolingStockLocations)
      .set({ quantity: newQty })
      .where(eq(toolingStockLocations.id, locId))
      .returning()

    await fastify.db.insert(toolingMutations).values({
      articleId:     loc.articleId,
      employeeId:    employee.employeeId,
      locationCode:  loc.locationCode,
      quantityDelta: body.data.delta,
    })

    return updated
  })

  // ── Locatie verplaatsen (transfer) ────────────────────────────────────────

  fastify.post('/kiosk/tooling/stock-locations/:locId/transfer', auth, async (req, reply) => {
    const { locId } = req.params as { locId: string }
    const body = z
      .object({
        toLocationCode: z.string().min(1).max(100),
        toLade:         z.string().max(50).optional(),
        toVak:          z.string().max(50).optional(),
        quantity:       z.number().int().min(1).max(9999),
      })
      .safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige invoer' })

    const employee = req.employee!

    const [sourceLoc] = await fastify.db
      .select()
      .from(toolingStockLocations)
      .where(eq(toolingStockLocations.id, locId))
      .limit(1)
    if (!sourceLoc) return reply.status(404).send({ error: 'Bronlocatie niet gevonden' })

    const newSourceQty = sourceLoc.quantity - body.data.quantity
    if (newSourceQty < 0) {
      return reply.status(400).send({ error: 'Onvoldoende voorraad op bronlocatie' })
    }

    await fastify.db.transaction(async (tx) => {
      // Verlaag bron
      await tx
        .update(toolingStockLocations)
        .set({ quantity: newSourceQty })
        .where(eq(toolingStockLocations.id, locId))

      // Verhoog (of maak) doellocatie
      await tx
        .insert(toolingStockLocations)
        .values({
          articleId:    sourceLoc.articleId,
          locationCode: body.data.toLocationCode,
          lade:         body.data.toLade ?? null,
          vak:          body.data.toVak  ?? null,
          quantity:     body.data.quantity,
        })
        .onConflictDoUpdate({
          target: [toolingStockLocations.articleId, toolingStockLocations.locationCode],
          set: {
            quantity: sql`${toolingStockLocations.quantity} + ${body.data.quantity}`,
            ...(body.data.toLade !== undefined ? { lade: body.data.toLade || null } : {}),
            ...(body.data.toVak  !== undefined ? { vak:  body.data.toVak  || null } : {}),
          },
        })

      // Mutatie-records
      await tx.insert(toolingMutations).values([
        {
          articleId:     sourceLoc.articleId,
          employeeId:    employee.employeeId,
          locationCode:  sourceLoc.locationCode,
          quantityDelta: -body.data.quantity,
        },
        {
          articleId:     sourceLoc.articleId,
          employeeId:    employee.employeeId,
          locationCode:  body.data.toLocationCode,
          quantityDelta: body.data.quantity,
        },
      ])
    })

    return { ok: true }
  })

  // ── Favorieten ophalen ────────────────────────────────────────────────────

  fastify.get('/kiosk/tooling/favorites', auth, async (req) => {
    const employee = req.employee!
    const rows = await fastify.db
      .select({ articleId: toolingFavorites.articleId })
      .from(toolingFavorites)
      .where(eq(toolingFavorites.employeeId, employee.employeeId))
    return { favoriteIds: rows.map((r) => r.articleId) }
  })

  // ── Favoriet toevoegen/verwijderen (toggle) ───────────────────────────────

  fastify.post('/kiosk/tooling/favorites/:id', auth, async (req) => {
    const { id } = req.params as { id: string }
    const employee = req.employee!

    const [existing] = await fastify.db
      .select()
      .from(toolingFavorites)
      .where(
        and(
          eq(toolingFavorites.employeeId, employee.employeeId),
          eq(toolingFavorites.articleId, id),
        ),
      )
      .limit(1)

    if (existing) {
      await fastify.db
        .delete(toolingFavorites)
        .where(
          and(
            eq(toolingFavorites.employeeId, employee.employeeId),
            eq(toolingFavorites.articleId, id),
          ),
        )
      return { favorited: false }
    } else {
      await fastify.db
        .insert(toolingFavorites)
        .values({ employeeId: employee.employeeId, articleId: id })
      return { favorited: true }
    }
  })

  // ── Assemblages zoeken (voor Demonteren-tab) ──────────────────────────────

  fastify.get('/kiosk/tooling/assemblies', auth, async (req) => {
    const { q } = req.query as { q?: string }
    const term = q?.trim() ?? ''

    // Zoek op ncName, toolnaam én houdernaam (zelfde breedte als CNC-admin zoekopdracht)
    const rows = await fastify.db.execute<{
      id: string; nc_number: number; nc_name: string; comment: string | null
    }>(sql`
      SELECT DISTINCT a.id, a.nc_number, a.nc_name, a.comment
      FROM tool_library_assemblies a
      LEFT JOIN tool_library_items t ON a.tool_item_id   = t.id
      LEFT JOIN tool_library_items h ON a.holder_item_id = h.id
      WHERE (
        ${term
          ? sql`(
              a.nc_name ILIKE ${'%' + term + '%'}
              OR t.name ILIKE ${'%' + term + '%'}
              OR h.name ILIKE ${'%' + term + '%'}
            )`
          : sql`TRUE`
        }
      )
      ORDER BY a.nc_name ASC
      LIMIT 20
    `)

    return rows.map((r) => ({
      id:       r.id,
      ncNumber: r.nc_number,
      ncName:   r.nc_name,
      comment:  r.comment,
    }))
  })

  // ── Assemblage detail met voorraadlocaties per component ──────────────────

  fastify.get('/kiosk/tooling/assemblies/:ncNumber', auth, async (req, reply) => {
    const { ncNumber: ncNumberStr } = req.params as { ncNumber: string }
    const ncNumber = parseInt(ncNumberStr, 10)
    if (isNaN(ncNumber)) return reply.status(400).send({ error: 'Ongeldig ncNumber' })

    // 1. Assemblage ophalen
    const [assembly] = await fastify.db
      .select({
        id:             toolLibraryAssemblies.id,
        ncNumber:       toolLibraryAssemblies.ncNumber,
        ncName:         toolLibraryAssemblies.ncName,
        comment:        toolLibraryAssemblies.comment,
        toolLength:     toolLibraryAssemblies.toolLength,
        presetDiameter: toolLibraryAssemblies.presetDiameter,
        holderItemId:   toolLibraryAssemblies.holderItemId,
        toolItemId:     toolLibraryAssemblies.toolItemId,
      })
      .from(toolLibraryAssemblies)
      .where(eq(toolLibraryAssemblies.ncNumber, ncNumber))
      .limit(1)

    if (!assembly) return reply.status(404).send({ error: 'Samenstelling niet gevonden' })

    // 2. Tussencomponenten (adapters/extensions)
    const compRows = await fastify.db
      .select({
        itemId:       toolLibraryAssemblyComponents.itemId,
        position:     toolLibraryAssemblyComponents.position,
        reach:        toolLibraryAssemblyComponents.reach,
        name:         toolLibraryItems.name,
        manufacturer: toolLibraryItems.manufacturer,
        orderingCode: toolLibraryItems.orderingCode,
        photoUrl:     toolLibraryItems.photoUrl,
        itemType:     toolLibraryItems.itemType,
      })
      .from(toolLibraryAssemblyComponents)
      .innerJoin(toolLibraryItems, eq(toolLibraryAssemblyComponents.itemId, toolLibraryItems.id))
      .where(eq(toolLibraryAssemblyComponents.assemblyId, assembly.id))
      .orderBy(asc(toolLibraryAssemblyComponents.position))

    // 3. Houder- en tool-item ophalen
    const itemFields = {
      id:           toolLibraryItems.id,
      name:         toolLibraryItems.name,
      manufacturer: toolLibraryItems.manufacturer,
      orderingCode: toolLibraryItems.orderingCode,
      photoUrl:     toolLibraryItems.photoUrl,
      itemType:     toolLibraryItems.itemType,
    }

    const [holderItem] = assembly.holderItemId
      ? await fastify.db.select(itemFields).from(toolLibraryItems).where(eq(toolLibraryItems.id, assembly.holderItemId)).limit(1)
      : []
    const [toolItem] = assembly.toolItemId
      ? await fastify.db.select(itemFields).from(toolLibraryItems).where(eq(toolLibraryItems.id, assembly.toolItemId)).limit(1)
      : []

    // 4. Voorraad ophalen voor alle betrokken items
    const allItemIds = [
      ...(holderItem ? [holderItem.id] : []),
      ...compRows.map((c) => c.itemId),
      ...(toolItem ? [toolItem.id] : []),
    ]

    type StockEntry = {
      sourceItemId: string | null
      articleId: string
      articleType: string
      locId: string | null
      locationCode: string | null
      quantity: number | null
    }

    const stockRows: StockEntry[] = allItemIds.length > 0
      ? await fastify.db
          .select({
            sourceItemId: toolingArticles.sourceItemId,
            articleId:    toolingArticles.id,
            articleType:  toolingArticles.articleType,
            locId:        toolingStockLocations.id,
            locationCode: toolingStockLocations.locationCode,
            quantity:     toolingStockLocations.quantity,
          })
          .from(toolingArticles)
          .leftJoin(toolingStockLocations, eq(toolingStockLocations.articleId, toolingArticles.id))
          .where(inArray(toolingArticles.sourceItemId, allItemIds))
      : []

    // 5. Groepeer op sourceItemId
    const stockMap = new Map<string, { articleId: string; articleType: string; locations: { id: string; locationCode: string; quantity: number }[] }>()
    for (const row of stockRows) {
      if (!row.sourceItemId) continue
      if (!stockMap.has(row.sourceItemId)) {
        stockMap.set(row.sourceItemId, { articleId: row.articleId, articleType: row.articleType, locations: [] })
      }
      if (row.locId && row.locationCode !== null && row.quantity !== null) {
        stockMap.get(row.sourceItemId)!.locations.push({ id: row.locId, locationCode: row.locationCode, quantity: row.quantity })
      }
    }

    function buildStock(itemId: string | null) {
      if (!itemId) return { articleId: null, articleType: null, locations: [] }
      const s = stockMap.get(itemId)
      if (!s) return { articleId: null, articleType: null, locations: [] }
      return { articleId: s.articleId, articleType: s.articleType, locations: s.locations }
    }

    // 6. Componentenlijst opbouwen (houder → tussencomponenten → tool)
    const components = [
      ...(holderItem ? [{
        type:         'holder' as const,
        position:     -1,
        name:         holderItem.name,
        manufacturer: holderItem.manufacturer,
        orderingCode: holderItem.orderingCode,
        photoUrl:     holderItem.photoUrl,
        reach:        null,
        ...buildStock(holderItem.id),
      }] : []),
      ...compRows.map((c) => ({
        type:         'extension' as const,
        position:     c.position,
        name:         c.name,
        manufacturer: c.manufacturer,
        orderingCode: c.orderingCode,
        photoUrl:     c.photoUrl,
        reach:        c.reach,
        ...buildStock(c.itemId),
      })),
      ...(toolItem ? [{
        type:         'tool' as const,
        position:     999,
        name:         toolItem.name,
        manufacturer: toolItem.manufacturer,
        orderingCode: toolItem.orderingCode,
        photoUrl:     toolItem.photoUrl,
        reach:        null,
        ...buildStock(toolItem.id),
      }] : []),
    ]

    return {
      assembly: {
        id:             assembly.id,
        ncNumber:       assembly.ncNumber,
        ncName:         assembly.ncName,
        comment:        assembly.comment,
        toolLength:     assembly.toolLength,
        presetDiameter: assembly.presetDiameter,
      },
      components,
    }
  })
}
