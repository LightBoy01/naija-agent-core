import { saveKnowledge } from '../packages/firebase/src/index.ts';

async function informMaster() {
  const MASTER_ORG_ID = 'naija-agent-master';
  console.log(`🧠 Educating the Master Bot with the new rules...`);

  try {
    const rules = [
      {
        key: 'Gold Rule (Credits)',
        content: 'All agents operate on a PRE-PAID basis. Replies cost ₦20 (2,000 kobo). Vision/Images cost ₦50. We deduct kobo BEFORE the AI thinks to prevent debt. If the AI fails, the system automatically refunds the Boss.'
      },
      {
        key: 'Iron Shield (Security)',
        content: 'All PINs are now cryptographically hashed. Even if the database is seen, no one can read the PINs. Users are locked out for 15 minutes after 3 wrong attempts.'
      },
      {
        key: 'Custom Bridge (Multi-Tenancy)',
        content: 'Clients can now use their own Meta Apps. To onboard them, we need their appSecret and whatsappToken. Without these, they default to the Sovereigns global keys.'
      },
      {
        key: '30-Day Audit (Storage)',
        content: 'Media links from WhatsApp expire after 30 days. Important receipts must be Archived Permanently via the Sovereign Dashboard to save them forever in our vault.'
      }
    ];

    for (const rule of rules) {
      await saveKnowledge(MASTER_ORG_ID, rule.key, rule.content);
      console.log(`✅ Rule Saved: ${rule.key}`);
    }

    console.log('\n👑 Master Bot is now fully informed and ready to serve.');
  } catch (error) {
    console.error('❌ Education failed:', error);
  }
}

informMaster();
