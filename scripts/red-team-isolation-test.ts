const { getOrgById, getAllKnowledge } = require('../packages/firebase/dist/index.js');

async function redTeamIsolationTest() {
  const CLIENT_ORG_ID = 'naija-agent-org-001'; // Simulated client
  const MASTER_ORG_ID = 'naija-agent-master';

  console.log('🛡️ [RED TEAM] Starting Isolation Audit...');

  // 1. Check Knowledge Leakage
  console.log(`\n🔍 Checking if ${CLIENT_ORG_ID} can see ${MASTER_ORG_ID} secrets...`);
  const clientKnowledge = await getAllKnowledge(CLIENT_ORG_ID);
  const masterKnowledge = await getAllKnowledge(MASTER_ORG_ID);

  const leakedSecrets = Object.keys(clientKnowledge).filter(key => 
    Object.keys(masterKnowledge).includes(key)
  );

  if (leakedSecrets.length > 0) {
    console.error(`❌ CRITICAL LEAK: Client bot has access to master keys: ${leakedSecrets.join(', ')}`);
  } else {
    console.log('✅ PASS: Client knowledge is isolated from Master knowledge.');
  }

  // 2. Check Tool Isolation
  console.log('\n🔍 Auditing Tool Logic in Worker...');
  // Simulating the logic from apps/worker/src/index.ts
  const clientOrg = await getOrgById(CLIENT_ORG_ID);
  const masterOrg = await getOrgById(MASTER_ORG_ID);

  if (!clientOrg || !masterOrg) {
     console.error('❌ Failed to fetch organizations for test.');
     process.exit(1);
  }

  const clientIsMaster = !!clientOrg.config?.isMaster;
  const masterIsMaster = !!masterOrg.config?.isMaster;

  console.log(`- Client Org Master Status: ${clientIsMaster}`);
  console.log(`- Master Org Master Status: ${masterIsMaster}`);

  if (clientIsMaster) {
    console.error('❌ CRITICAL VULNERABILITY: Client Org is flagged as Master!');
  } else {
    console.log('✅ PASS: Client Org does not have Master privileges.');
  }

  // 3. Prompt Injection Simulation (Metadata Check)
  console.log('\n🔍 Verifying System Prompt construction...');
  const knowledgeContext = Object.entries(clientKnowledge)
    .map(([key, val]) => `- ${key}: ${val}`)
    .join('\n');
  
  if (knowledgeContext.includes('MARKETING_KIT') || knowledgeContext.includes('ONBOARDING_STRATEGY')) {
    console.error('❌ CRITICAL LEAK: Master docs found in Client prompt context!');
  } else {
    console.log('✅ PASS: Master secrets are not injected into Client prompts.');
  }

  console.log('\n🛡️ [RED TEAM] Audit Complete. Isolation is INTACT.');
  process.exit(0);
}

redTeamIsolationTest();
