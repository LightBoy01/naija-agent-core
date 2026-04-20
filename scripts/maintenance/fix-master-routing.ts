import { db } from '@naija-agent/firebase';

const MASTER_ORG_ID = 'naija-agent-master';
const NEW_PHONE_ID = '1034379023092936'; // +234 912 158 0452
const NEW_WABA_ID = '814809477680902';
const APP_SECRET = process.env.WHATSAPP_APP_SECRET; // Assumed same app
const API_TOKEN = process.env.WHATSAPP_API_TOKEN; // Assumed same system user

async function main() {
  console.log(`🛠️ Fixing Master Bot Routing for: ${MASTER_ORG_ID}...`);

  const orgRef = db.collection('organizations').doc(MASTER_ORG_ID);
  const org = await orgRef.get();

  if (!org.exists) {
    console.error(`❌ Org ${MASTER_ORG_ID} not found!`);
    return;
  }

  const currentData = org.data();
  console.log('--- Current Data ---');
  console.log(`Phone ID: ${currentData?.whatsappPhoneId}`);
  console.log(`WABA ID: ${currentData?.config?.wabaId}`);

  // Update to NEW details
  await orgRef.update({
    whatsappPhoneId: NEW_PHONE_ID,
    'config.wabaId': NEW_WABA_ID,
    'config.whatsappToken': API_TOKEN, // Ensure token is fresh
    'config.appSecret': APP_SECRET,
    'config.isMaster': true,
    updatedAt: new Date()
  });

  console.log('✅ Master Bot Updated Successfully!');
  console.log(`New Phone ID: ${NEW_PHONE_ID}`);
  console.log(`New WABA ID: ${NEW_WABA_ID}`);
  
  // Verify Playground (Test Number)
  const playgroundRef = db.collection('organizations').doc('naija-agent-playground');
  const playground = await playgroundRef.get();
  if (playground.exists) {
      console.log('\n--- Test Bot (Playground) Status ---');
      console.log(`Phone ID: ${playground.data()?.whatsappPhoneId}`);
      console.log(`(Should be: 1189172570934595)`);
  }
}

main().catch(console.error);
