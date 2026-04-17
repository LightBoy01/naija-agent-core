import dotenv from 'dotenv';
import { executeLifeTool } from '../apps/worker-life/src/tools.js';
import { lifeMemory } from '../apps/worker-life/src/services/lifeMemory.js';

dotenv.config();

// ============================================================================
// 🧪 AELIXXR (LIFE OS) - LIFE MEMORY & FEEDBACK TEST SUITE
// ============================================================================
// Run via: npx tsx scripts/test-aelixxr-life-memory.ts
// ============================================================================

const TEST_USER_ID = '+2348000000001'; // Use a distinct test phone number

async function runTests() {
  console.log('\n=================================================');
  console.log('🚀 INITIALIZING LIFE MEMORY TEST SUITE');
  console.log('=================================================\n');

  try {
    // --- 1. Test getContext (Should create new user and grant welcome bonus) ---
    console.log(`\n-------------------------------------------------`);
    console.log(`🧪 TESTING SERVICE: [lifeMemory.getContext]`);
    console.log(`📝 Description: Fetch context for a new user.`);
    console.log(`-------------------------------------------------`);
    let context = await lifeMemory.getContext(TEST_USER_ID);
    console.log(`✅ SUCCESS. Energy Credits: ${context.energyCredits}`);

    // --- 2. Test checkExists ---
    console.log(`\n-------------------------------------------------`);
    console.log(`🧪 TESTING SERVICE: [lifeMemory.checkExists]`);
    console.log(`📝 Description: Check if the user exists.`);
    console.log(`-------------------------------------------------`);
    let exists = await lifeMemory.checkExists(TEST_USER_ID);
    console.log(`✅ SUCCESS. Exists: ${exists}`);

    // --- 3. Test addEnergy ---
    console.log(`\n-------------------------------------------------`);
    console.log(`🧪 TESTING SERVICE: [lifeMemory.addEnergy]`);
    console.log(`📝 Description: Add 10 energy credits.`);
    console.log(`-------------------------------------------------`);
    let newBalance = await lifeMemory.addEnergy(TEST_USER_ID, 10);
    console.log(`✅ SUCCESS. New Balance: ${newBalance}`);

    // --- 4. Test deductEnergy ---
    console.log(`\n-------------------------------------------------`);
    console.log(`🧪 TESTING SERVICE: [lifeMemory.deductEnergy]`);
    console.log(`📝 Description: Deduct 5 energy credits.`);
    console.log(`-------------------------------------------------`);
    newBalance = await lifeMemory.deductEnergy(TEST_USER_ID, 5);
    console.log(`✅ SUCCESS. New Balance: ${newBalance}`);

    // --- 5. Test update_life_context Tool ---
    console.log(`\n-------------------------------------------------`);
    console.log(`🧪 TESTING TOOL: [update_life_context]`);
    console.log(`📝 Description: Saving core personal details to long-term memory.`);
    console.log(`-------------------------------------------------`);
    const updatePayload = {
      userId: TEST_USER_ID,
      fullName: 'Test User',
      family: { spouse: 'Test Spouse' },
      goals: ['Japa by 2027'],
      preferences: { diet: 'Vegan' }
    };
    const updateResult = await executeLifeTool('update_life_context', updatePayload);
    console.log(`✅ SUCCESS. Tool Response:`, updateResult);

    // Verify context was actually updated
    context = await lifeMemory.getContext(TEST_USER_ID);
    console.log(`🔍 Verified Context Goals:`, context.goals);

    // --- 6. Test log_feedback Tool ---
    console.log(`\n-------------------------------------------------`);
    console.log(`🧪 TESTING TOOL: [log_feedback]`);
    console.log(`📝 Description: Logging user sentiment and learning a new rule.`);
    console.log(`-------------------------------------------------`);
    const feedbackPayload = {
      userId: TEST_USER_ID,
      sessionId: 'test_session_123',
      originalMessage: 'I hate it when you call me Oga. Please stop.',
      sentiment: 'negative',
      feedbackType: 'explicit',
      learnedRule: 'Do not use the word Oga.',
      internalNote: 'User explicitly requested to stop using the honorific.'
    };
    const feedbackResult = await executeLifeTool('log_feedback', feedbackPayload);
    console.log(`✅ SUCCESS. Tool Response:`, feedbackResult);

    // Verify the learned rule was saved in communication preferences
    context = await lifeMemory.getContext(TEST_USER_ID);
    console.log(`🔍 Verified Learned Rules:`, context.communicationPreferences?.customRules);

    // --- 7. Test log_feedback Tool (Rate Limiting) ---
    console.log(`\n-------------------------------------------------`);
    console.log(`🧪 TESTING TOOL: [log_feedback] (Rate Limit Check)`);
    console.log(`📝 Description: Trying to log feedback again within 1 hour.`);
    console.log(`-------------------------------------------------`);
    const feedbackResult2 = await executeLifeTool('log_feedback', feedbackPayload);
    console.log(`✅ SUCCESS. Tool Response:`, feedbackResult2);


  } catch (error: any) {
    console.log(`❌ TEST SUITE FAILED`);
    console.error(`   Reason:`, error.message);
  }

  console.log('\n=================================================');
  console.log('🎉 LIFE MEMORY TESTING COMPLETE');
  console.log('=================================================\n');
  process.exit(0);
}

runTests();
