import { FastifyInstance } from 'fastify'
import { eq, desc, ilike, or, sql, and } from 'drizzle-orm'
import { z } from 'zod'
import {
  toolingArticles,
  toolingStockLocations,
  toolingMutations,
  toolingFavorites,
  employees,
  toolLibraryAssemblies,
  toolLibraryItems,
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
      })
      .from(toolingMutations)
      .leftJoin(employees, eq(employees.id, toolingMutations.employeeId))
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

    return { article, locations, mutations: mutationRows, related, assemblies }
  })

  // ── Locatie toevoegen ──────────────────────────────────────────────────────

  fastify.post('/kiosk/tooling/articles/:id/locations', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({ locationCode: z.string().min(1).max(100) }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Ongeldige locatiecode' })

    const [article] = await fastify.db
      .select({ id: toolingArticles.id })
      .from(toolingArticles)
      .where(eq(toolingArticles.id, id))
      .limit(1)
    if (!article) return reply.status(404).send({ error: 'Artikel niet gevonden' })

    const [loc] = await fastify.db
      .insert(toolingStockLocations)
      .values({ articleId: id, locationCode: body.data.locationCode, quantity: 0 })
      .onConflictDoNothing()
      .returning()

    if (!loc) return reply.status(409).send({ error: 'Locatie bestaat al' })
    return loc
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
          quantity:     body.data.quantity,
        })
        .onConflictDoUpdate({
          target: [toolingStockLocations.articleId, toolingStockLocations.locationCode],
          set: {
            quantity: sql`${toolingStockLocations.quantity} + ${body.data.quantity}`,
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
}
