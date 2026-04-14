import dotenv from 'dotenv';
import { getLifeTools, executeLifeTool } from '../apps/worker-life/src/tools.js';

dotenv.config();

// ============================================================================
// 🧪 AELIXXR (LIFE OS) - COMPREHENSIVE TOOL TEST TEMPLATES
// ============================================================================
// Run via: npx tsx scripts/test-aelixxr-tools.ts
//
// These templates demonstrate the exact JSON payloads the Gemini model 
// generates when calling Aelixxr's native tools. 
// ============================================================================

const TEST_USER_ID = '2347042310893'; // Replace with a safe test phone number

const toolTestTemplates = [
  {
    name: 'generate_invite',
    description: 'Generates a referral link for a user to invite friends.',
    payload: {
      userId: TEST_USER_ID
    }
  },
  {
    name: 'generate_quiz',
    description: 'Creates a custom study quiz using the smaller model.',
    payload: {
      subject: 'Mathematics',
      topic: 'Quadratic Equations',
      level: 'SS2'
    }
  },
  {
    name: 'save_note',
    description: 'Saves a text memory or important fact to the personal Vault.',
    payload: {
      userId: TEST_USER_ID,
      note: 'My new WiFi password for the Lekki apartment is 9988776655.'
    }
  },
  {
    name: 'search_vault',
    description: 'Searches the user\'s personal Vault for documents, receipts, or notes.',
    payload: {
      userId: TEST_USER_ID,
      query: 'WiFi password Lekki'
    }
  },
  {
    name: 'delete_from_vault',
    description: 'Deletes a specific document or note from the Vault.',
    payload: {
      userId: TEST_USER_ID,
      docId: 'MOCK_DOC_ID_12345' // Replace with an actual ID from search_vault to test deletion
    }
  },
  {
    name: 'web_search',
    description: 'Searches the live internet for general knowledge or news.',
    payload: {
      query: 'Current official exchange rate of Naira to Dollar 2026'
    }
  },
  {
    name: 'delegate_task',
    description: 'Passes a complex instruction to a specialized Sector Pack.',
    payload: {
      sector: 'CommercePack',
      instruction: 'Find the lowest price for a 50kg bag of rice in the Lagos market dataset and summarize the trends.'
    }
  }
];

async function runTests() {
  console.log('\n=================================================');
  console.log('🚀 INITIALIZING AELIXXR TOOL TEST SUITE');
  console.log('=================================================\n');

  // --- Verify Tool Definitions Load ---
  console.log('>>> FETCHING TOOL DEFINITIONS...');
  const tools = await getLifeTools();
  const staticTools = tools[0]?.functionDeclarations?.map(t => t.name) || [];
  console.log(`✅ Loaded ${staticTools.length} Native Tools:`);
  console.log(staticTools.map(t => `   - ${t}`).join('\n'));
  console.log('');

  // --- Run the Templates ---
  for (const test of toolTestTemplates) {
    console.log(`\n-------------------------------------------------`);
    console.log(`🧪 TESTING TOOL: [${test.name}]`);
    console.log(`📝 Description: ${test.description}`);
    console.log(`📦 Payload: ${JSON.stringify(test.payload, null, 2)}`);
    console.log(`-------------------------------------------------`);
    
    try {
      console.log(`⏳ Executing...`);
      const startTime = Date.now();
      
      const result = await executeLifeTool(test.name, test.payload);
      
      const elapsed = Date.now() - startTime;
      console.log(`✅ SUCCESS (${elapsed}ms)`);
      console.log(`📥 Response:`);
      console.log(JSON.stringify(result, null, 2).slice(0, 1500) + (JSON.stringify(result).length > 1500 ? '\n... [TRUNCATED]' : ''));
      
    } catch (e: any) {
      console.log(`❌ FAILED`);
      console.error(`   Reason:`, e.message);
      
      // Provide helpful tips for specific failures
      if (e.message.includes('Firebase') || e.message.includes('Firestore')) {
        console.log(`   💡 Tip: Ensure your .env file has valid GOOGLE_APPLICATION_CREDENTIALS or Firebase config to test Vault/Database tools locally.`);
      }
      if (e.message.includes('API key')) {
        console.log(`   💡 Tip: Missing GEMINI_API_KEY. Required for 'generate_quiz' and 'delegate_task'.`);
      }
    }
  }

  console.log('\n=================================================');
  console.log('🎉 TOOL TESTING COMPLETE');
  console.log('=================================================\n');
  process.exit(0);
}

// Execute the test suite
runTests();
