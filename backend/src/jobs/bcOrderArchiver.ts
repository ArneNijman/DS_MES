import { FastifyInstance } from 'fastify'
import { and, inArray, isNotNull, isNull } from 'drizzle-orm'
import { productSetups } from '../db/schema.js'
import { createBCClientFromDB } from '../bc/client.js'

const CHECK_INTERVAL_MS = 30 * 60 * 1000  // 30 minuten

async function archiveFinishedOrders(fastify: FastifyInstance) {
  let client
  try {
    client = await createBCClientFromDB(fastify)
  } catch {
    fastify.log.warn('BC order archiver: kon geen BC-verbinding maken, poging overgeslagen')
    return
  }
  if (!client) return

  let companyId: string
  try {
    const companies = await client.get<{ value: { id: string }[] }>('/companies')
    companyId = companies.value?.[0]?.id
    if (!companyId) return
  } catch {
    fastify.log.warn('BC order archiver: ophalen companies mislukt, poging overgeslagen')
    return
  }

  let finishedNos: string[]
  try {
    const res = await client.get<{ value: Record<string, unknown>[] }>(
      `/companies(${companyId})/productionOrders?$filter=status eq 'Finished'&$select=no&$top=500`,
    )
    finishedNos = (res.value ?? [])
      .map(o => String(o['no'] ?? o['No'] ?? '').trim())
      .filter(Boolean)
  } catch {
    fastify.log.warn('BC order archiver: ophalen Finished orders mislukt, poging overgeslagen')
    return
  }

  fastify.log.info(`BC order archiver: ${finishedNos.length} Finished order(s) opgehaald uit BC`)

  // Actieve setups waarvan het ordernummer in de Finished-lijst staat
  const activeSetups = await fastify.db
    .select({ id: productSetups.id, productionOrderNo: productSetups.productionOrderNo })
    .from(productSetups)
    .where(
      and(
        isNull(productSetups.archivedAt),
        isNotNull(productSetups.productionOrderNo),
        inArray(productSetups.productionOrderNo, finishedNos),
      ),
    )

  if (!activeSetups.length) {
    fastify.log.info('BC order archiver: geen actieve setups gevonden die overeenkomen met Finished orders')
    return
  }

  const now = new Date()
  await fastify.db
    .update(productSetups)
    .set({ archivedAt: now, archivedOrderStatus: 'Finished' })
    .where(inArray(productSetups.id, activeSetups.map(s => s.id)))

  const orders = [...new Set(activeSetups.map(s => s.productionOrderNo))]
  fastify.log.info(
    `BC order archiver: ${activeSetups.length} setup(s) gearchiveerd voor order(s) ${orders.join(', ')}`,
  )
}

let handle: ReturnType<typeof setInterval> | null = null

export function startBcOrderArchiver(fastify: FastifyInstance) {
  archiveFinishedOrders(fastify).catch((err) => fastify.log.error(err))
  handle = setInterval(() => {
    archiveFinishedOrders(fastify).catch((err) => fastify.log.error(err))
  }, CHECK_INTERVAL_MS)
}

export function stopBcOrderArchiver() {
  if (handle) { clearInterval(handle); handle = null }
}
