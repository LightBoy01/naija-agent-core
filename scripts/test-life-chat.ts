import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

console.log('🧠 Testing Life Operating System (LOS) - Chat & Tools...');

const redisConfig = {
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null
};

// 1. Connect to the Queue
const lifeQueue = new Queue('life-queue', { connection: redisConfig });
const lifeQueueEvents = new QueueEvents('life-queue', { connection: redisConfig });

async function runTest() {
    console.log('📤 Adding "life-chat" job (User asking about Rice prices)...');
    
    // Simulating a user who wants Aelixxr to read a specific website
    // This will test the newly integrated MCP Fetch server.
    const job = await lifeQueue.add('life-chat', {
        userPhone: '+2348000000000',
        orgId: 'naija-agent-master', // Add orgId for billing verification
        message: 'Aelixxr, please read https://example.com and summarize what it says in one short sentence.',
        timestamp: Date.now()
    });

    console.log(`✅ Job Added! ID: ${job.id}`);
    console.log('⏳ Waiting for result (Gemini Thinking + Tool Execution)...');
    
    try {
        const result = await job.waitUntilFinished(lifeQueueEvents);
        console.log('🎉 Job Completed!');
        console.log('🤖 AI Reply:', result.reply);
    } catch (err: any) {
        console.error('❌ Job Failed:', err.message);
        // Check failed reason
        const failedJob = await lifeQueue.getJob(job.id!);
        console.error('Reason:', failedJob?.failedReason);
    }

    await lifeQueue.close();
    await lifeQueueEvents.close();
    process.exit(0);
}

runTest().catch(err => {
    console.error('❌ Test Script Failed:', err);
    process.exit(1);
});
