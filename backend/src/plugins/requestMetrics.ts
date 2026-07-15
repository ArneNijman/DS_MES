import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'

export interface RequestRecord {
  method: string
  route: string
  rawUrl: string
  statusCode: number
  durationMs: number
  timestamp: string
}

declare module 'fastify' {
  interface FastifyRequest {
    startTime: number
  }
  interface FastifyInstance {
    requestBuffer: () => RequestRecord[]
  }
}

const buffer: RequestRecord[] = []
const MAX = 200

function normalize(url: string): string {
  return url
    .split('?')[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id')
}

export default fp(async (fastify: FastifyInstance) => {
  fastify.decorateRequest('startTime', 0)

  fastify.addHook('onRequest', async (req) => {
    req.startTime = Date.now()
  })

  fastify.addHook('onResponse', async (req, reply) => {
    const durationMs = Date.now() - req.startTime
    buffer.push({
      method:     req.method,
      route:      normalize(req.url),
      rawUrl:     req.url,
      statusCode: reply.statusCode,
      durationMs,
      timestamp:  new Date().toISOString(),
    })
    if (buffer.length > MAX) buffer.shift()
  })

  fastify.decorate('requestBuffer', () => buffer)
})
