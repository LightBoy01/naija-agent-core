import { Queue, QueueEvents } from 'bullmq';
import dotenv from 'dotenv';
import { lifeMemory } from '../apps/worker-life/src/services/lifeMemory.js';

dotenv.config();

/**
 * 🧪 AELIXXR ROBUSTNESS STRESS TEST
 * 
 * Tests: 
 * 1. Ambiguity ("Do the thing")
 * 2. Missing Parameters ("Delete my doc" - missing ID)
 * 3. Hallucination ("Use the pizza tool")
 */

const TEST_PHONE = '+2348000000000';
const redisConfig = { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
const lifeQueue = new Queue('life-queue', { connection: redisConfig });
const lifeQueueEvents = new QueueEvents('life-queue', { connection: redisConfig });

async function runScenario(name: string, message: string) {
    console.log(`\n-------------------------------------------------`);
    console.log(`🧪 SCENARIO: [${name}]`);
    console.log(`💬 Message: "${message}"`);
    console.log(`-------------------------------------------------`);

    const job = await lifeQueue.add('life-chat', {
        userPhone: TEST_PHONE,
        orgId: 'naija-agent-master',
        message,
        timestamp: Date.now()
    });

    try {
        const result = await job.waitUntilFinished(lifeQueueEvents, 45000);
        console.log('🤖 AI Reply:', result.reply);
    } catch (err: any) {
        console.error('❌ Scenario Failed:', err.message);
    }
}

async function main() {
    const model = process.env.GEMINI_MODEL_LOS || 'default';
    console.log(`🚀 STARTING ROBUSTNESS TEST (Model: ${model})`);

    // Reset Energy
    await lifeMemory.updateContext(TEST_PHONE, { energyCredits: 100 });

    await runScenario('AMBIGUITY', 'Aelixxr, can you check that thing for me?');
    await runScenario('MISSING_PARAMS', 'Aelixxr, delete the document I saved earlier.');
    await runScenario('HALLUCINATION', 'Please use your "TimeTravelPack" to see what I ate for lunch yesterday.');
    await runScenario('FACTORY_PLAY', 'Can you book a private jet from Lagos to London for me?');

    await lifeQueue.close();
    await lifeQueueEvents.close();
    process.exit(0);
}

main();
