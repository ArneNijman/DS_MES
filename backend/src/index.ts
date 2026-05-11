import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import staticFiles from '@fastify/static'
import path from 'path'
import { fileURLToPath } from 'url'

import dbPlugin from './plugins/db.js'
import redisPlugin from './plugins/redis.js'
import authPlugin from './plugins/auth.js'

import { healthRoutes } from './routes/health.js'
import { adminAuthRoutes, seedAdminUser } from './routes/admin/auth.js'
import { adminEmployeeRoutes, seedAdminEmployee } from './routes/admin/employees.js'
import { adminBcConfigRoutes } from './routes/admin/bc-config.js'
import { adminBcFieldMapRoutes } from './routes/admin/bc-field-map.js'
import { adminMachineRoutes } from './routes/admin/machines.js'
import { kioskEmployeeRoutes } from './routes/kiosk/employees.js'
import { kioskNcrRoutes } from './routes/kiosk/ncr.js'
import { kioskTaskRoutes } from './routes/kiosk/tasks.js'
import { kioskMachinesReadonlyRoutes } from './routes/kiosk/machines-kiosk.js'
import { kioskPreventiefRoutes } from './routes/kiosk/preventief.js'
import { kioskKlantmeldingRoutes } from './routes/kiosk/klantmelding.js'
import { kioskMeetmiddelenRoutes } from './routes/kiosk/meetmiddelen.js'
import { cncRoutes } from './routes/admin/cnc.js'
import { kioskToolingRoutes } from './routes/kiosk/tooling.js'
import { productSetupRoutes } from './routes/kiosk/product-setup.js'
import { kioskCadRoutes } from './routes/kiosk/cad.js'
import { bcLookupRoutes } from './routes/kiosk/bc-lookup.js'
import { syncToolingArticles } from './cnc/syncToolingArticles.js'

import { validateEncryptionKey } from './utils/crypto.js'
import { migrateClientSecrets } from './utils/migrate-secrets.js'
import { startPolling, stopPolling } from './bc/poller.js'
import { startMaintenanceIntervalChecker, stopMaintenanceIntervalChecker } from './jobs/maintenanceIntervalChecker.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const fastify = Fastify({ logger: true })

async function main() {
  validateEncryptionKey()

  await fastify.register(cors, { origin: true })
  await fastify.register(jwt, { secret: process.env.JWT_SECRET ?? '' })
  await fastify.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } })
  await fastify.register(dbPlugin)
  await fastify.register(redisPlugin)
  await fastify.register(authPlugin)
  await fastify.register(staticFiles, {
    root: '/app/uploads',
    prefix: '/uploads/',
  })

  // Startup taken
  await seedAdminUser(fastify)
  await seedAdminEmployee(fastify)
  await migrateClientSecrets(fastify)
  await syncToolingArticles(fastify.db)
  startPolling(fastify)
  startMaintenanceIntervalChecker(fastify)

  // Routes
  await fastify.register(healthRoutes)
  await fastify.register(adminAuthRoutes, { prefix: '/api' })
  await fastify.register(adminEmployeeRoutes, { prefix: '/api' })
  await fastify.register(adminBcConfigRoutes, { prefix: '/api' })
  await fastify.register(adminBcFieldMapRoutes, { prefix: '/api' })
  await fastify.register(adminMachineRoutes, { prefix: '/api' })
  await fastify.register(kioskEmployeeRoutes, { prefix: '/api' })
  await fastify.register(kioskNcrRoutes, { prefix: '/api' })
  await fastify.register(kioskTaskRoutes, { prefix: '/api' })
  await fastify.register(kioskMachinesReadonlyRoutes, { prefix: '/api' })
  await fastify.register(kioskPreventiefRoutes, { prefix: '/api' })
  await fastify.register(kioskKlantmeldingRoutes, { prefix: '/api' })
  await fastify.register(kioskMeetmiddelenRoutes, { prefix: '/api' })
  await fastify.register(cncRoutes, { prefix: '/api' })
  await fastify.register(kioskToolingRoutes, { prefix: '/api' })
  await fastify.register(productSetupRoutes, { prefix: '/api' })
  await fastify.register(kioskCadRoutes, { prefix: '/api' })
  await fastify.register(bcLookupRoutes, { prefix: '/api' })

  // Graceful shutdown
  const shutdown = async () => {
    stopPolling()
    stopMaintenanceIntervalChecker()
    await fastify.close()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  await fastify.listen({ port: 3000, host: '0.0.0.0' })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
