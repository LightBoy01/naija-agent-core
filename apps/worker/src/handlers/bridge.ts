import { Job, Queue } from 'bullmq';
import { JobData } from '@naija-agent/types';
import { WhatsAppService } from '../services/whatsapp.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  getOrgById, 
  findPendingTransaction, 
  confirmTransaction, 
  topupTenant,
  getDb
} from '@naija-agent/firebase';
import crypto from 'crypto';
import { formatCurrency } from '../utils/currency.js';
import { logger } from '../utils/logger.js';

/**
 * Extracts amount from typical Nigerian bank SMS formats
 * e.g. "Amt: NGN 5,000.00", "Cr: 10,000", "Credit: 2,500.50"
 */
function extractAmountFromSMS(body: string): number | null {
  const cleanBody = body.replace(/,/g, ''); // Remove commas for easier matching
  
  // 🛡️ [FRAUD GUARD]: Explicitly reject Debit alerts
  if (/\b(?:Debit|Dr|Withdrawal|Sent|Paid)\b/i.test(cleanBody)) {
     logger.warn({ bodySnippet: body.substring(0, 50) }, `🛑 [SMS BRIDGE] Rejected potential Debit alert`);
     return null;
  }

  const patterns = [
    /(?:Amt|Amount|Cr|Credit|Received|Value|Inflow)[:\s]+(?:NGN|N|#)?\s*([\d.]+)/i,
    /([\d.]+)\s*has\s*been\s*credited/i,
    /Acct:\s*\d+\s*Type:Cr\s*Amt:\s*([\d.]+)/i, // Specialized for Access/Zenith
    /Trans\s*Amt:\s*NGN\s*([\d.]+)/i, // Specialized for GTB
    /Inflow:\s*NGN\s*([\d.]+)/i, // Specialized for Kuda/OPay
    /successfully\s*credited\s*with\s*NGN\s*([\d.]+)/i
  ];

  for (const pattern of patterns) {
    const match = cleanBody.match(pattern);
    if (match && match[1]) {
      const amount = parseFloat(match[1]);
      if (!isNaN(amount) && amount > 0) {
         return amount;
      }
    }
  }
  return null;
}

export async function handleSmsBridge(
  job: Job<JobData>,
  whatsappQueue: Queue,
  genAI: GoogleGenerativeAI,
  defaultWhatsAppService: WhatsAppService
): Promise<{ success: boolean, alertId?: string }> {
  const { from: smsSender, orgId, content, timestamp: smsTimestamp } = job.data;
  const body = content.text || '';
  
  if (!orgId) throw new Error('Missing orgId in SMS Bridge job');

  const org = await getOrgById(orgId);
  if (!org) throw new Error(`Org ${orgId} not found for SMS Bridge`);

  const phoneId = org.whatsappPhoneId;

  // 1. Idempotency: Check if this SMS was already processed
  const rawIdSource = `${smsTimestamp}_${smsSender}_${body}`;
  const alertId = crypto.createHash('sha256').update(rawIdSource).digest('hex').substring(0, 16);
  const db = getDb();
  const alertDoc = await db.collection('organizations').doc(orgId).collection('sms_alerts').doc(alertId).get();
  
  if (alertDoc.exists) {
    logger.info({ alertId, orgId }, '⏭️ [SMS BRIDGE WORKER] Already processed alert. Skipping.');
    return { success: true, alertId };
  }

  // 2. Log the SMS as a confirmed alert signal
  await db.collection('organizations').doc(orgId).collection('sms_alerts').doc(alertId).set({
    from: smsSender,
    body,
    timestamp: new Date(smsTimestamp),
    receivedAt: new Date(),
  });

  // 3. Matching Logic
  let amount = extractAmountFromSMS(body);
  
  // 🎯 LLM FALLBACK: If regex fails, use Gemini to parse the bank SMS
  if (amount === null && process.env.GEMINI_API_KEY) {
     logger.info({ orgId }, '🔍 [SMS BRIDGE WORKER] Regex failed. Calling Gemini...');
     try {
       const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
       const prompt = `Extract the transaction amount as a number only from this Nigerian bank SMS. 
       If no amount is found, return "NULL". 
       SMS: "${body}"`;
       
       const aiResult = await model.generateContent(prompt);
       const aiText = aiResult.response.text().trim();
       if (aiText !== "NULL") {
          const parsed = parseFloat(aiText.replace(/[^0-9.]/g, ''));
          if (!isNaN(parsed)) {
             amount = parsed;
             logger.info({ orgId, amount }, '✅ [SMS BRIDGE WORKER] Gemini extracted amount.');
          }
       }
     } catch (e: any) {
        logger.error({ orgId, error: e.message }, '❌ [SMS BRIDGE WORKER] Gemini fallback failed.');
     }
  }

  if (amount !== null) {
    // --- REFILL CHECK: Does the SMS body contain the Sovereign's Account Number? ---
    const sovereignAccount = org.config?.sovereignBankDetails?.accountNumber;
    const isRefill = sovereignAccount && body.includes(sovereignAccount);

    const tenantWhatsAppService = org.config?.whatsappToken 
      ? new WhatsAppService(
          org.config.whatsappToken, 
          org.whatsappPhoneId || '',
          org.config.appSecret
        ) 
      : defaultWhatsAppService;

    if (isRefill) {
       logger.info({ orgId, amount }, '💳 [REFILL MATCH] SMS linked to Sovereign account. Crediting Org.');
       const result = await topupTenant(orgId, amount, alertId);
       
       if (result && org.config?.adminPhone) {
          const greeting = org.region === 'NG' ? 'Oga' : 'Hello';
          const currency = org.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };
          const formattedAmount = formatCurrency(amount, currency.locale, currency.code);
          const formattedBalance = formatCurrency(result.newBalance / 100, currency.locale, currency.code);

          const notificationMsg = `✅ *AI Credit Refill Confirmed (SMS Bridge)*\n\n${greeting}, your payment of *${formattedAmount}* has been received via bank alert.\n\nYour bot has been credited! New balance: *${formattedBalance}*.`;

          const notificationJob: JobData = {
            type: 'text',
            orgId: 'system',
            phoneId: org.whatsappPhoneId,
            from: org.config.adminPhone,
            messageId: `BR-${Date.now()}`,
            timestamp: Date.now(),
            content: { text: notificationMsg }
          };
          await whatsappQueue.add('process-message', notificationJob, { removeOnComplete: true });
       }
    } else {
       // --- STANDARD SALE MATCHING ---
       const pendingTx = await findPendingTransaction(orgId, amount);
       if (pendingTx) {
         logger.info({ orgId, amount, txId: pendingTx.id }, '✅ [SALE MATCH] Linking SMS to Pending Tx.');
         await confirmTransaction(pendingTx.id, alertId);

         const currency = org.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };
         const formattedAmount = formatCurrency(amount, currency.locale, currency.code);

         // 1. Notify Customer via WhatsApp
         const customerJob: JobData = {
           type: 'text',
           orgId: orgId,
           phoneId: phoneId,
           from: pendingTx.from,
           messageId: `SALE-${Date.now()}`,
           timestamp: Date.now(),
           content: {
             text: `✅ *Payment Confirmed!*\n\nWe have received your payment of *${formattedAmount}*. Your order is now being processed. Thank you!`
           }
         };
         await whatsappQueue.add('process-message', customerJob, { removeOnComplete: true });

         // 2. Notify Boss via WhatsApp (Immediate Sale Alert)
         if (org.config?.adminPhone) {
            const bossGreeting = org.region === 'NG' ? 'Oga' : 'Hello';
            const bossJob: JobData = {
              type: 'text',
              orgId: 'system',
              phoneId: phoneId,
              from: org.config.adminPhone,
              messageId: `BOSS-SALE-${Date.now()}`,
              timestamp: Date.now(),
              content: {
                text: `💰 *SALE CONFIRMED (Bank Alert)!*\n\n${bossGreeting}, a customer (*${pendingTx.from}*) has just paid *${formattedAmount}*.\n\nOrder Ref: ${pendingTx.id}\nI have informed the customer already!`
              }
            };
            await whatsappQueue.add('process-message', bossJob, { removeOnComplete: true });
         }
       }
    }
  } else {
     // Regex and Gemini both failed
     logger.warn({ orgId, bodySnippet: body.substring(0, 100) }, '⚠️ [SMS BRIDGE WORKER] Failed to extract amount from SMS.');
     
     // 🛡️ [SOVEREIGN SNITCH]: Alert the Master Bot about the parsing failure
     if (process.env.MASTER_ADMIN_PHONE) {
        const snitchMsg = `⚠️ *SMS PARSING FAILURE*\n\nOrg: ${org.name} (${orgId})\nSender: ${smsSender}\n\n*Body:* ${body}\n\nOga, Gemini and Regex both failed to find the amount. Please update the patterns!`;
        const snitchJob: JobData = {
           type: 'text',
           orgId: 'system',
           phoneId: process.env.WHATSAPP_PHONE_ID || '', 
           from: process.env.MASTER_ADMIN_PHONE,
           messageId: `SNITCH-${Date.now()}`,
           timestamp: Date.now(),
           content: { text: snitchMsg }
        };
        await whatsappQueue.add('process-message', snitchJob, { removeOnComplete: true });
     }
  }

  return { success: true, alertId };
}
