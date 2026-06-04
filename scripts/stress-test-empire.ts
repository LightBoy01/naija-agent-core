import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://159.195.150.66:6379';
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue('whatsapp-queue', { connection: redis });

async function runTest(count: number) {
    console.log(`🚀 Starting Sovereign Stress Test: ${count} messages...`);
    const start = Date.now();

    // Chunk to avoid memory issues locally
    const chunkSize = 500;
    for (let i = 0; i < count; i += chunkSize) {
        const jobs = Array.from({ length: Math.min(chunkSize, count - i) }).map((_, j) => ({
            name: 'process-message',
            data: {
                from: '2348_stress_tester',
                orgId: 'aelixxr', 
                type: 'text',
                content: { text: 'Stress test message ' + (i + j) },
                messageId: 'STRESS-' + Date.now() + '-' + (i + j),
                timestamp: Date.now(),
                isStressTest: true 
            },
            opts: {
                attempts: 1,
                removeOnComplete: true,
                removeOnFail: true
            }
        }));

        await Promise.all(jobs.map(job => queue.add(job.name, job.data, job.opts)));
        console.log(`📡 Pushed ${i + jobs.length}/${count} messages...`);
    }

    const end = Date.now();
    const duration = (end - start) / 1000;
    console.log(`✅ COMPLETED: ${count} jobs pushed in ${duration.toFixed(2)}s`);
    console.log(`📊 Ingestion Speed: ${(count / duration).toFixed(2)} jobs/sec`);

    await redis.quit();
}

runTest(5000).catch(console.error);
