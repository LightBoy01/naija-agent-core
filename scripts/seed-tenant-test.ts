import { createTenant, saveMessage, findOrCreateChat, addBalance, getDb } from '../packages/firebase/dist/index.js';
import bcrypt from 'bcrypt';

async function seed() {
  const tenantId = 'bims-gadgets';
  const adminPhone = '2348000000001'; // Dummy Boss Phone
  
  console.log(`🌱 Seeding Tenant: ${tenantId}...`);

  // 1. Create Tenant
  await createTenant({
    id: tenantId,
    name: 'Bims Gadgets & Electronics',
    whatsappPhoneId: '1234567890', // Dummy Phone ID
    adminPhone,
    systemPrompt: 'You are Bims Gadgets assistant. Be polite and professional.'
  });

  // 2. Set a known PIN for testing (Default is 1234, but let's be explicit)
  const hashedPin = await bcrypt.hash('5555', 10);
  const db = getDb();
  await db.collection('organizations').doc(tenantId).update({
    'config.adminPin': hashedPin
  });

  // 3. Add some dummy chats for Bims
  const customerPhone = '2349011112222';
  const chatId = await findOrCreateChat(tenantId, customerPhone, 'Chinedu Customer');
  
  await saveMessage(chatId, {
    role: 'user',
    content: 'How much for iPhone 15?',
    type: 'text'
  });

  await saveMessage(chatId, {
    role: 'assistant',
    content: 'iPhone 15 is ₦1,200,000. Do you want to pay now?',
    type: 'text'
  });

  // 4. Add a dummy receipt message to test Media Vault isolation
  await saveMessage(chatId, {
    role: 'user',
    content: '[IMAGE]',
    type: 'image',
    metadata: {
      mediaId: 'dummy_media_id_123',
      caption: 'I have paid.'
    }
  });

  console.log('✅ Seed Complete!');
  console.log(`   Organization: ${tenantId}`);
  console.log(`   Admin Phone: ${adminPhone}`);
  console.log(`   Test PIN: 5555`);
}

seed().catch(console.error);
