import { FastifyInstance } from 'fastify'
import { bcSyncQueue } from '../../jobs/queue.js'

function parseRedisInfo(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.split('\r\n')) {
    const colon = line.indexOf(':')
    if (colon !== -1) {
      result[line.slice(0, colon)] = line.slice(colon + 1)
    }
  }
  return result
}

function p95(durations: number[]): number {
  if (durations.length === 0) return 0
  const sorted = [...durations].sort((a, b) => a - b)
  return sorted[Math.floor(0.95 * (sorted.length - 1))]
}

export async function systemRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.requireAuth] }

  fastify.get('/admin/system-metrics', auth, async () => {
    const mem = process.memoryUsage()

    // Redis stats
    let redis = null
    try {
      const raw = await fastify.redis.info()
      const info = parseRedisInfo(raw)
      redis = {
        memoryMb:         Math.round(parseInt(info['used_memory'] ?? '0', 10) / 1024 / 1024 * 10) / 10,
        uptimeSeconds:    parseInt(info['uptime_in_seconds'] ?? '0', 10),
        connectedClients: parseInt(info['connected_clients'] ?? '0', 10),
        role:             info['role'] ?? 'unknown',
      }
    } catch {
      redis = null
    }

    // BullMQ queue stats
    let queues: { name: string; waiting: number; active: number; completed: number; failed: number; delayed: number }[] = []
    try {
      const counts = await bcSyncQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')
      queues = [{
        name:      'bc-sync',
        waiting:   counts.waiting   ?? 0,
        active:    counts.active    ?? 0,
        completed: counts.completed ?? 0,
        failed:    counts.failed    ?? 0,
        delayed:   counts.delayed   ?? 0,
      }]
    } catch {
      queues = []
    }

    // Request metrics uit de ring buffer
    const buffer = fastify.requestBuffer()
    const recent = [...buffer].reverse().slice(0, 50)

    // Aggregeren per route
    const routeMap = new Map<string, { durations: number[]; errorCodes: number[] }>()
    for (const r of buffer) {
      const key = `${r.method} ${r.route}`
      if (!routeMap.has(key)) routeMap.set(key, { durations: [], errorCodes: [] })
      const entry = routeMap.get(key)!
      entry.durations.push(r.durationMs)
      if (r.statusCode >= 400) entry.errorCodes.push(r.statusCode)
    }

    const byRoute = [...routeMap.entries()]
      .map(([route, { durations, errorCodes }]) => {
        const sorted = [...durations].sort((a, b) => a - b)
        const avg = Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)
        // Tel unieke statuscodes: { 401: 2, 500: 1 }
        const errorsByCode = errorCodes.reduce<Record<number, number>>((acc, code) => {
          acc[code] = (acc[code] ?? 0) + 1
          return acc
        }, {})
        return {
          route,
          count:        durations.length,
          avgMs:        avg,
          minMs:        sorted[0],
          maxMs:        sorted[sorted.length - 1],
          p95Ms:        p95(durations),
          errorCount:   errorCodes.length,
          errorsByCode,
        }
      })
      .sort((a, b) => b.avgMs - a.avgMs)

    return {
      uptime: Math.floor(process.uptime()),
      memory: {
        heapUsedMb:  Math.round(mem.heapUsed  / 1024 / 1024 * 10) / 10,
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024 * 10) / 10,
        rssMb:       Math.round(mem.rss       / 1024 / 1024 * 10) / 10,
      },
      redis,
      queues,
      recent,
      byRoute,
    }
  })
}
