import { Queue } from 'bullmq';
import Redis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

let redisConnection: Redis | null = null;
let notificationQueue: Queue | null = null;
let lifeQueue: Queue | null = null;

function getConnection() {
  if (!redisConnection) {
    redisConnection = new Redis(redisConfig);
  }
  return redisConnection;
}

export function getNotificationQueue() {
  if (!notificationQueue) {
    notificationQueue = new Queue('whatsapp-queue', { 
      connection: getConnection() 
    });
  }
  return notificationQueue;
}

export function getLifeQueue() {
  if (!lifeQueue) {
    lifeQueue = new Queue('life-queue', { 
      connection: getConnection() 
    });
  }
  return lifeQueue;
}
