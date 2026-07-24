const { Queue } = require('bullmq');
const Redis = require('ioredis');
require('dotenv').config();

const redisUrl = process.env.REDIS_URL_LOS || process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = new Redis(redisUrl);
const lifeQueue = new Queue('life-queue', { connection: redisClient });

async function refresh() {
    await lifeQueue.add('admin-refresh-prompts', {});
    console.log("✅ admin-refresh-prompts job added to life-queue");
    process.exit(0);
}
refresh();
