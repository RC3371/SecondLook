import { Queue } from 'bullmq'
import IORedis from 'ioredis'

const connection = new IORedis(process.env.UPSTASH_REDIS_REST_URL!, {
  password: process.env.UPSTASH_REDIS_REST_TOKEN,
  tls: { rejectUnauthorized: false },
  maxRetriesPerRequest: null,
})

export const triageQueue = new Queue('triage', { connection })

export { connection }