import { Queue } from 'bullmq'

export type BcSyncJobData =
  | { type: 'sync-employees' }
  | { type: 'sync-all' }

function createRedisConnection() {
  const url = process.env.REDIS_URL ?? 'redis://redis:6379'
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
  }
}

export const bcSyncQueue = new Queue<BcSyncJobData>('bc-sync', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86400, count: 50 },
  },
})
