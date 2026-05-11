import { Queue } from 'bullmq'
import IORedis from 'ioredis'

function createConnection() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  if (!url) throw new Error('UPSTASH_REDIS_REST_URL is not configured')
  return new IORedis(url, {
    password: process.env.UPSTASH_REDIS_REST_TOKEN,
    tls: {},
    maxRetriesPerRequest: null,
  })
}

// Lazy singletons — nothing connects until first uses
let _connection: IORedis | null = null
let _triageQueue: Queue | null = null

export function getConnection(): IORedis {
  if (!_connection) _connection = createConnection()
  return _connection
}

export function getTriageQueue(): Queue {
  if (!_triageQueue) _triageQueue = new Queue('triage', { connection: getConnection() })
  return _triageQueue
}

// Legacy named export for any existing imports
export const triageQueue = { add: (...args: Parameters<Queue['add']>) => getTriageQueue().add(...args) }
