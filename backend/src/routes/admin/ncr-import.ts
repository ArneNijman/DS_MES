import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sql, and, eq, inArray } from 'drizzle-orm'
import { ncrRegistrations, statusLogs } from '../../db/schema.js'

const importRowSchema = z.object({
  ncrId:               z.string(),
  productionOrder:     z.string().nullable().optional(),
  itemRef:             z.string().nullable().optional(),
  itemName:            z.string().nullable().optional(),
  writtenByName:       z.string().nullable().optional(),
  writtenByDepartment: z.string().nullable().optional(),
  causingDepartment:   z.string().nullable().optional(),
  faultCode:           z.string().nullable().optional(),
  causeCode:           z.string().nullable().optional(),
  shortDescription:    z.string().nullable().optional(),
  description:         z.string().nullable().optional(),
  solution:            z.string().nullable().optional(),
  dispositionType:     z.string().nullable().optional(),
  peEmail:             z.string().nullable().optional(),
  uitgevoerdDoor:      z.string().nullable().optional(),
  status:              z.string().default('open'),
  createdAt:           z.string().nullable().optional(),
  closedAt:            z.string().nullable().optional(),
})

const importBodySchema = z.object({
  records: z.array(importRowSchema),
})

export async function ncrImportRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/admin/ncr/import',
    { preHandler: [fastify.requireAdmin] },
    async (req, reply) => {
      const body = importBodySchema.safeParse(req.body)
      if (!body.success) return reply.status(400).send({ error: 'Ongeldige invoer' })

      const rows = body.data.records
      if (rows.length === 0) return { inserted: 0, updated: 0, logs: 0 }

      const values = rows.map((r) => ({
        ncrId:               r.ncrId,
        productionOrder:     r.productionOrder  ?? null,
        itemRef:             r.itemRef          ?? null,
        itemName:            r.itemName         ?? null,
        writtenByName:       r.writtenByName    ?? null,
        writtenByDepartment: r.writtenByDepartment ?? null,
        causingDepartment:   r.causingDepartment   ?? null,
        faultCode:           r.faultCode        ?? null,
        causeCode:           r.causeCode        ?? null,
        shortDescription:    r.shortDescription ?? null,
        description:         r.description      ?? null,
        solution:            r.solution         ?? null,
        dispositionType:     r.dispositionType  ?? null,
        peEmail:             r.peEmail          ?? null,
        status:              r.status,
        ...(r.createdAt ? { createdAt: new Date(r.createdAt), updatedAt: new Date(r.createdAt) } : {}),
      }))

      const result = await fastify.db
        .insert(ncrRegistrations)
        .values(values)
        .onConflictDoUpdate({
          target: ncrRegistrations.ncrId,
          set: {
            productionOrder:     sql`excluded.production_order`,
            itemRef:             sql`excluded.item_ref`,
            itemName:            sql`excluded.item_name`,
            writtenByName:       sql`excluded.written_by_name`,
            writtenByDepartment: sql`excluded.written_by_department`,
            causingDepartment:   sql`excluded.causing_department`,
            faultCode:           sql`excluded.fault_code`,
            causeCode:           sql`excluded.cause_code`,
            shortDescription:    sql`excluded.short_description`,
            description:         sql`excluded.description`,
            solution:            sql`excluded.solution`,
            dispositionType:     sql`excluded.disposition_type`,
            peEmail:             sql`excluded.pe_email`,
            status:              sql`excluded.status`,
            createdAt:           sql`excluded.created_at`,
            updatedAt:           sql`excluded.updated_at`,
          },
        })
        .returning({ id: ncrRegistrations.id, ncrId: ncrRegistrations.ncrId, status: ncrRegistrations.status })

      // Statuslog voor afgesloten/vervallen NCR's met DatumUitgevoerd
      const CLOSED_STATUSES = ['gesloten', 'vervallen']
      const logRows = result
        .map((ncr) => {
          const row = rows.find((r) => r.ncrId === ncr.ncrId)
          if (!row?.closedAt || !CLOSED_STATUSES.includes(ncr.status)) return null
          return {
            entityType: 'ncr' as const,
            entityId:   ncr.id,
            fromStatus: 'open',
            toStatus:   ncr.status,
            changedByName: row.uitgevoerdDoor ?? null,
            createdAt:  new Date(row.closedAt),
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      if (logRows.length > 0) {
        // Controleer welke NCR's nog geen statuslog hebben om duplicaten te voorkomen
        const ids = logRows.map((l) => l.entityId)
        const existing = await fastify.db
          .select({ entityId: statusLogs.entityId })
          .from(statusLogs)
          .where(and(eq(statusLogs.entityType, 'ncr'), inArray(statusLogs.entityId, ids)))
        const existingIds = new Set(existing.map((r) => r.entityId))
        const newLogs = logRows.filter((l) => !existingIds.has(l.entityId))
        if (newLogs.length > 0) {
          await fastify.db.insert(statusLogs).values(newLogs)
        }
        logRows.length = newLogs.length
      }

      return { processed: result.length, logs: logRows.length }
    },
  )
}
