import { Queue } from 'bullmq';
import type { AppEnv } from '@global-emotes/config';
import type { JobEnqueuer } from './context';

/** BullMQ-backed enqueuer for dev/prod. Tests inject an inline runner instead. */
export function createBullEnqueuer(env: AppEnv): JobEnqueuer {
  const queues = new Map<string, Queue>();
  const url = new URL(env.REDIS_URL);
  const connection = {
    host: url.hostname,
    port: Number(url.port || 6379),
  };
  return {
    async enqueue(queueName, payload) {
      let queue = queues.get(queueName);
      if (!queue) {
        queue = new Queue(queueName, { connection });
        queues.set(queueName, queue);
      }
      await queue.add(queueName, payload, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    },
  };
}
