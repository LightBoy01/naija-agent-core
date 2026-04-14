'use server';

import { getNotificationQueue, getLifeQueue } from '../../../lib/queue';
import { verifySovereignSession } from '../../../lib/auth';

export async function getQueuesStatus() {
  await verifySovereignSession();

  const queues = [
    { name: 'BOS Queue (WhatsApp)', queue: getNotificationQueue() },
    { name: 'LOS Queue (Life OS)', queue: getLifeQueue() },
  ];

  const statuses = await Promise.all(
    queues.map(async ({ name, queue }) => {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount()
      ]);

      const failedJobs = await queue.getFailed(0, 4);

      return {
        name,
        counts: { waiting, active, completed, failed, delayed },
        recentFailures: failedJobs.map((job) => ({
          id: String(job.id || 'unknown'),
          name: job.name,
          failedReason: job.failedReason || 'Unknown error',
          timestamp: job.timestamp,
          data: (job.data || {}) as Record<string, unknown>
        }))
      };
    })
  );

  return statuses;
}

export async function cleanFailedJobs(queueName: 'BOS' | 'LOS') {
  await verifySovereignSession();

  const queue = queueName === 'BOS' ? getNotificationQueue() : getLifeQueue();
  await queue.clean(0, 1000, 'failed');
  return { success: true };
}

export async function retryFailedJob(queueName: 'BOS' | 'LOS', jobId: string) {
  await verifySovereignSession();

  const queue = queueName === 'BOS' ? getNotificationQueue() : getLifeQueue();
  const job = await queue.getJob(jobId);
  if (job) {
    await job.retry();
    return { success: true };
  }
  return { success: false, error: 'Job not found' };
}
