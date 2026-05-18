import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { roleModulePermissions } from '../db/schema.js'

export async function rolePermissionRoutes(fastify: FastifyInstance) {
  const adminAuth = { preHandler: [fastify.requireAdmin] }
  const kioskAuth = { preHandler: [fastify.requireAuth] }

  // ── Admin: haal alle rol-module permissies op ─────────────────────────────

  fastify.get('/admin/role-permissions', adminAuth, async () => {
    const rows = await fastify.db.select().from(roleModulePermissions)
    const result: Record<string, string[]> = {}
    for (const row of rows) {
      if (!result[row.role]) result[row.role] = []
      result[row.role].push(row.moduleKey)
    }
    return result
  })

  // ── Admin: sla modules op voor een rol ───────────────────────────────────

  fastify.put('/admin/role-permissions/:role', adminAuth, async (req, reply) => {
    const { role } = req.params as { role: string }
    const { modules } = req.body as { modules: string[] }
    if (!Array.isArray(modules)) return reply.status(400).send({ error: 'modules moet een array zijn' })

    await fastify.db.delete(roleModulePermissions).where(eq(roleModulePermissions.role, role))
    if (modules.length > 0) {
      await fastify.db
        .insert(roleModulePermissions)
        .values(modules.map(m => ({ role, moduleKey: m })))
    }
    return { ok: true }
  })

  // ── Kiosk: haal toegestane modules op voor een rol ────────────────────────

  fastify.get('/kiosk/role-permissions/:role', kioskAuth, async (req) => {
    const { role } = req.params as { role: string }
    const rows = await fastify.db
      .select({ moduleKey: roleModulePermissions.moduleKey })
      .from(roleModulePermissions)
      .where(eq(roleModulePermissions.role, role))
    return rows.map(r => r.moduleKey)
  })
}
