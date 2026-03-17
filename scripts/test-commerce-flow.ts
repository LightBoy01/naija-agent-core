import dotenv from 'dotenv';
import { Redis } from 'ioredis';
import { handleToolCall } from '../apps/worker/src/tool-handlers.js';
import { WhatsAppService } from '../apps/worker/src/services/whatsapp.js';
import { getProvider } from '@naija-agent/payments';
import { getDb, findOrCreateChat } from '@naija-agent/firebase';

dotenv.config();

// Mock Services
class MockWhatsAppService extends WhatsAppService {
  constructor() { super('mock-token', 'mock-phone-id'); }
  async sendText(to: string, text: string) {
    console.log(`\n🤖 [BOT REPLY]: ${text}\n`);
    return { messaging_product: 'whatsapp', contacts: [], messages: [{ id: 'mock-msg-id' }] };
  }
}

async function runCommerceTest() {
  console.log('🛒 Starting Commerce Flow Test...');

  const redis = new Redis({ host: process.env.REDIS_HOST || 'localhost', port: 6379 });
  const db = await getDb();
  const testOrgId = 'test-commerce-org';
  const testUserPhone = '2348011111111';

  // 1. Setup Mock Org & Product
  console.log('📦 Seeding Product...');
  await db.collection('organizations').doc(testOrgId).set({
      id: testOrgId,
      name: 'Test Shop',
      currency: { code: 'NGN', symbol: '₦', locale: 'en-NG' },
      balance: 100000,
      config: { 
          payment: { provider: 'mock', secretKey: 'sk_test' },
          bankDetails: {
              bankName: 'Test Bank',
              accountNumber: '1234567890',
              accountName: 'Test Shop Ltd'
          }
      }
  });
  
  await db.collection('organizations').doc(testOrgId).collection('products').doc('prod-1').set({
      id: 'prod-1',
      name: 'Test Sneaker',
      price: 15000,
      stock: 10,
      imageUrl: 'http://example.com/shoe.jpg'
  });

  // 1.5 Ensure Chat Session Exists & Clear Cart
  await findOrCreateChat(testOrgId, testUserPhone, 'Shopper');
  
  const commonDeps = {
      orgId: testOrgId,
      from: testUserPhone,
      isStaff: false,
      isAdmin: false,
      isAuth: false,
      whatsappService: new MockWhatsAppService(),
      paymentProvider: getProvider('mock'),
      redisClient: redis,
      orgConfig: { 
          payment: { provider: 'mock', secretKey: 'sk_test' },
          bankDetails: {
              bankName: 'Test Bank',
              accountNumber: '1234567890',
              accountName: 'Test Shop Ltd'
          }
      },
      currency: { code: 'NGN', symbol: '₦', locale: 'en-NG' },
      whatsappPhoneId: 'mock-id',
      customerName: 'Shopper',
      isVisionContext: false
  };

  // Clear Cart first
  await handleToolCall('clear_cart', {}, commonDeps as any);

  try {
      // 2. Add to Cart
      console.log('\n--- 1. Add to Cart ---');
      const addRes = await handleToolCall('add_to_cart', { productId: 'prod-1', quantity: 2 }, commonDeps as any);
      console.log('Result:', addRes);
      if (addRes.status !== 'success') throw new Error('Add to cart failed');

      // 3. View Cart
      console.log('\n--- 2. View Cart ---');
      const viewRes: any = await handleToolCall('view_cart', {}, commonDeps as any);
      console.log('Result:', viewRes);
      if (!viewRes.totalNaira || viewRes.totalNaira !== 30000) throw new Error('Cart total mismatch');

      // 4. Get Payment Instructions
      console.log('\n--- 3. Get Payment Instructions ---');
      const payRes = await handleToolCall('get_payment_instructions', { purpose: 'sale' }, commonDeps as any);
      console.log('Result:', payRes);

      // 5. Verify Transaction (Manager Role)
      console.log('\n--- 4. Verify Payment (Manager) ---');
      // Update deps to be manager
      const managerDeps = { ...commonDeps, isAdmin: true, isAuth: true };
      
      const verifyRes = await handleToolCall('verify_transaction', {
          reference: 'REF-MOCK-123',
          amount: 30000,
          bankName: 'GTBank',
          date: new Date().toISOString(),
          purpose: 'sale',
          isSuspicious: false
      }, managerDeps as any);
      
      console.log('Result:', verifyRes);
      if (verifyRes.status !== 'success' && verifyRes.status !== 'verified') throw new Error('Payment verification failed');

      console.log('\n✅ Commerce Flow Test PASSED.');

  } catch (err: any) {
      console.error('\n❌ Commerce Flow FAILED:', err.message);
  } finally {
      // Cleanup
      await db.collection('organizations').doc(testOrgId).delete();
      redis.disconnect();
      process.exit(0);
  }
}

runCommerceTest();
