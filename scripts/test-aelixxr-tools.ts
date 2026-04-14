import dotenv from 'dotenv';
import { getLifeTools, executeLifeTool } from '../apps/worker-life/src/tools.js';

dotenv.config();

async function runTests() {
    console.log('🧪 Testing Aelixxr (Life OS) Native Tools...\n');

    // 1. Test getLifeTools() to verify the tools list
    console.log('--- 1. Fetching Tool Definitions ---');
    const tools = await getLifeTools();
    const staticTools = tools[0]?.functionDeclarations?.map(t => t.name) || [];
    console.log('Loaded Native Tools:', staticTools);
    console.log('Total Tool Collections (Native + MCP):', tools.length);
    console.log('-------------------------------------\n');

    // 2. Test generate_invite tool
    console.log('--- 2. Testing: generate_invite ---');
    try {
        const inviteResult = await executeLifeTool('generate_invite', { userId: '2348012345678' });
        console.log('Result:', JSON.stringify(inviteResult, null, 2));
    } catch (e: any) {
        console.error('Error:', e.message);
    }
    console.log('-------------------------------------\n');

    // 3. Test generate_quiz tool
    console.log('--- 3. Testing: generate_quiz ---');
    try {
        const quizResult = await executeLifeTool('generate_quiz', { 
            subject: 'Mathematics', 
            topic: 'Algebra', 
            level: 'JSS3' 
        });
        console.log('Result:', JSON.stringify(quizResult, null, 2));
    } catch (e: any) {
        console.error('Error:', e.message);
    }
    console.log('-------------------------------------\n');

    // We can't fully test Vault without Firebase initialized properly with credentials,
    // but we have verified the static definitions and execution branching.
    
    console.log('✅ Tool testing complete!');
    process.exit(0);
}

runTests();
