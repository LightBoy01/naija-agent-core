import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

console.log('🧪 Testing Life Operating System (LOS) Engine...');

const redisConfig = {
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null
};

// 1. Connect to the Queue and Events listener
const lifeQueue = new Queue('life-queue', { connection: redisConfig });
const lifeQueueEvents = new QueueEvents('life-queue', { connection: redisConfig });

async function runTest() {
    console.log('📤 Adding "market-scrape" job to Life Queue...');
    
    const job = await lifeQueue.add('market-scrape', {
        orgId: 'test-org',
        timestamp: Date.now()
    });

    console.log(`✅ Job Added! ID: ${job.id}`);
    console.log('⏳ Waiting for result (simulating worker processing)...');
    
    // Wait for the job to complete using QueueEvents
    let result = await job.waitUntilFinished(lifeQueueEvents);
    
    console.log('🎉 Job Completed!');
    console.log('📊 Result:', JSON.stringify(result, null, 2));

    await lifeQueue.close();
    await lifeQueueEvents.close();
    process.exit(0);
}

runTest().catch(err => {
    console.error('❌ Test Failed:', err);
    process.exit(1);
});
