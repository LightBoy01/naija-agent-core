import { getOrgByPhoneId } from '@naija-agent/firebase';

const NEW_PHONE_ID = '1034379023092936';

async function main() {
  console.log(`🔍 Verifying Routing for Phone ID: ${NEW_PHONE_ID}...`);
  
  try {
    const org = await getOrgByPhoneId(NEW_PHONE_ID);
    
    if (org) {
      console.log('✅ Found Organization:');
      console.log(`- ID: ${org.id}`);
      console.log(`- Name: ${org.name}`);
      console.log(`- Configured Phone ID: ${org.whatsappPhoneId}`);
      console.log(`- Configured WABA ID: ${org.config?.wabaId}`);
    } else {
      console.error('❌ No Organization found for this Phone ID!');
      console.log('This means the API will ignore incoming messages.');
    }
  } catch (error) {
    console.error('❌ Error checking routing:', error);
  }
}

main();
