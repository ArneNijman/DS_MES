import { FastifyInstance } from 'fastify'
import { and, asc, desc, eq, isNotNull, or, sql } from 'drizzle-orm'
import { like } from 'drizzle-orm'
import { productSetups, productSetupSteps, ncrRegistrations, cncProgramRuns, machines } from '../../db/schema.js'

export async function setupArchiefRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  // ── Artikeloverzicht: unieke artikelen met gearchiveerde setups ────────────

  fastify.get('/kiosk/archive/articles', auth, async () => {
    const rows = await fastify.db
      .select({
        articleNo:        productSetups.articleNo,
        articleName:      productSetups.articleName,
        latestArchivedAt: sql<string>`MAX(${productSetups.archivedAt})`,
        orderCount:       sql<number>`COUNT(DISTINCT ${productSetups.productionOrderNo})::int`,
      })
      .from(productSetups)
      .where(isNotNull(productSetups.archivedAt))
      .groupBy(productSetups.articleNo, productSetups.articleName)
      .orderBy(asc(productSetups.articleNo))

    return rows
  })

  // ── Orders per artikel ────────────────────────────────────────────────────

  fastify.get('/kiosk/archive/orders', auth, async (req) => {
    const { articleNo } = req.query as { articleNo?: string }
    if (!articleNo) return []

    const rows = await fastify.db
      .select({
        productionOrderNo: productSetups.productionOrderNo,
        description:       productSetups.description,
        archivedAt:        productSetups.archivedAt,
        setupCount:        sql<number>`COUNT(${productSetups.id})::int`,
      })
      .from(productSetups)
      .where(
        and(
          isNotNull(productSetups.archivedAt),
          eq(productSetups.articleNo, articleNo),
        ),
      )
      .groupBy(
        productSetups.productionOrderNo,
        productSetups.description,
        productSetups.archivedAt,
      )
      .orderBy(desc(productSetups.archivedAt))

    return rows
  })

  // ── Setups per order (product + meet gecombineerd) ────────────────────────

  fastify.get('/kiosk/archive/setups', auth, async (req) => {
    const { productionOrderNo } = req.query as { productionOrderNo?: string }
    if (!productionOrderNo) return []

    const rows = await fastify.db
      .select({
        id:                productSetups.id,
        productionOrderNo: productSetups.productionOrderNo,
        articleNo:         productSetups.articleNo,
        articleName:       productSetups.articleName,
        setupType:         productSetups.setupType,
        description:       productSetups.description,
        createdAt:         productSetups.createdAt,
        archivedAt:        productSetups.archivedAt,
        totalSteps:        sql<number>`(
          SELECT COUNT(*)::int FROM product_setup_steps s WHERE s.setup_id = ${productSetups.id}
        )`,
      })
      .from(productSetups)
      .where(
        and(
          isNotNull(productSetups.archivedAt),
          eq(productSetups.productionOrderNo, productionOrderNo),
        ),
      )
      .orderBy(asc(productSetups.setupType), asc(productSetups.createdAt))

    return rows
  })

  // ── NCR's per order ───────────────────────────────────────────────────────

  fastify.get('/kiosk/archive/ncrs', auth, async (req) => {
    const { productionOrderNo } = req.query as { productionOrderNo?: string }
    if (!productionOrderNo) return []

    const rows = await fastify.db
      .select({
        id:               ncrRegistrations.id,
        ncrId:            ncrRegistrations.ncrId,
        productionOrder:  ncrRegistrations.productionOrder,
        itemRef:          ncrRegistrations.itemRef,
        itemName:         ncrRegistrations.itemName,
        shortDescription: ncrRegistrations.shortDescription,
        status:           ncrRegistrations.status,
        faultCode:        ncrRegistrations.faultCode,
        causeCode:        ncrRegistrations.causeCode,
        createdAt:        ncrRegistrations.createdAt,
      })
      .from(ncrRegistrations)
      .where(eq(ncrRegistrations.productionOrder, productionOrderNo))
      .orderBy(desc(ncrRegistrations.createdAt))

    return rows
  })

  // ── Programma-runs per artikel (cross-machine) ────────────────────────────

  fastify.get('/kiosk/archive/program-runs', auth, async (req) => {
    const { articleNo, limit: limitStr } = req.query as { articleNo?: string; limit?: string }
    if (!articleNo) return []

    const limit = Math.min(parseInt(limitStr ?? '100', 10) || 100, 500)

    const rows = await fastify.db
      .select({
        id:              cncProgramRuns.id,
        machineId:       cncProgramRuns.machineId,
        machineName:     machines.name,
        programName:     cncProgramRuns.programName,
        startedAt:       cncProgramRuns.startedAt,
        endedAt:         cncProgramRuns.endedAt,
        durationSeconds: cncProgramRuns.durationSeconds,
        status:          cncProgramRuns.status,
      })
      .from(cncProgramRuns)
      .leftJoin(machines, eq(machines.id, cncProgramRuns.machineId))
      .where(
        or(
          like(cncProgramRuns.programName, `%\\${articleNo}\\%`),
          like(cncProgramRuns.programName, `%/${articleNo}/%`),
        ),
      )
      .orderBy(desc(cncProgramRuns.startedAt))
      .limit(limit)

    return rows
  })
}
