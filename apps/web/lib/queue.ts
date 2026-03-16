import { Queue } from 'bullmq';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

let notificationQueue: Queue | null = null;

export function getNotificationQueue() {
  if (!notificationQueue) {
    notificationQueue = new Queue('whatsapp-queue', { 
      connection: redisConfig 
    });
  }
  return notificationQueue;
}
