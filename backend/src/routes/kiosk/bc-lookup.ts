import { FastifyInstance } from 'fastify'
import { createBCClientFromDB } from '../../bc/client.js'

interface BcOrder {
  no: string
  description: string
  articleNo: string
  status: string
}

interface BcRouting {
  operationNo: string
  description: string
  workCenterNo: string
}

function strVal(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

export async function bcLookupRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  // ── Productieorders ophalen uit BC ────────────────────────────────────────

  fastify.get('/kiosk/bc/production-orders', auth, async (_req, reply) => {
    try {
      const client = await createBCClientFromDB(fastify)
      if (!client) return reply.send([])

      const companies = await client.get<{ value: { id: string }[] }>('/companies')
      const companyId = companies.value?.[0]?.id
      if (!companyId) return reply.send([])

      const res = await client.get<{ value: Record<string, unknown>[] }>(
        `/companies(${companyId})/productionOrders?$filter=status eq 'Released' or status eq 'Firm Planned'&$top=200&$orderby=no desc`,
      )

      const orders: BcOrder[] = (res.value ?? []).map(o => ({
        no:          strVal(o, 'no', 'No', 'number'),
        description: strVal(o, 'description', 'Description', 'sourceDescription'),
        articleNo:   strVal(o, 'sourceNo', 'itemNo', 'sourceNo_', 'ItemNo'),
        status:      strVal(o, 'status', 'Status'),
      })).filter(o => o.no !== '')

      return reply.send(orders)
    } catch (err) {
      fastify.log.warn(`BC productieorders ophalen mislukt: ${err instanceof Error ? err.message : String(err)}`)
      return reply.send([])
    }
  })

  // ── Bewerkingen (routings) ophalen gefilterd op productieorder ────────────

  fastify.get('/kiosk/bc/production-orders/:orderNo/routings', auth, async (req, reply) => {
    const { orderNo } = req.params as { orderNo: string }

    try {
      const client = await createBCClientFromDB(fastify)
      if (!client) return reply.send([])

      const companies = await client.get<{ value: { id: string }[] }>('/companies')
      const companyId = companies.value?.[0]?.id
      if (!companyId) return reply.send([])

      const encoded = encodeURIComponent(orderNo)
      const res = await client.get<{ value: Record<string, unknown>[] }>(
        `/companies(${companyId})/productionOrderRoutings?$filter=productionOrderNo eq '${encoded}' and status eq 'Released'&$orderby=operationNo asc`,
      )

      const routings: BcRouting[] = (res.value ?? []).map(r => ({
        operationNo:  strVal(r, 'operationNo', 'operationNo_', 'OperationNo', 'no', 'No'),
        description:  strVal(r, 'description', 'Description', 'operationDescription'),
        workCenterNo: strVal(r, 'workCenterNo', 'workCenterNo_', 'WorkCenterNo'),
      })).filter(r => r.operationNo !== '')

      return reply.send(routings)
    } catch (err) {
      fastify.log.warn(`BC routings ophalen mislukt: ${err instanceof Error ? err.message : String(err)}`)
      return reply.send([])
    }
  })
}
