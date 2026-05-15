import { Job, Queue } from 'bullmq';
import { JobData } from '@naija-agent/types';
import { WhatsAppService } from '../services/whatsapp.js';
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
import { AIProvider } from '@naija-agent/ai';

/**
 * Extracts amount from typical Nigerian bank SMS formats
 */
function extractAmountFromSMS(body: string): number | null {
  const cleanBody = body.replace(/,/g, ''); 
  
  if (/\b(?:Debit|Dr|Withdrawal|Sent|Paid)\b/i.test(cleanBody)) {
     logger.warn({ bodySnippet: body.substring(0, 50) }, `🛑 [SMS BRIDGE] Rejected potential Debit alert`);
     return null;
  }

  const patterns = [
    /(?:Amt|Amount|Cr|Credit|Received|Value|Inflow)[:\s]+(?:NGN|N|#)?\s*([\d.]+)/i,
    /([\d.]+)\s*has\s*been\s*credited/i,
    /Acct:\s*\d+\s*Type:Cr\s*Amt:\s*([\d.]+)/i, 
    /Trans\s*Amt:\s*NGN\s*([\d.]+)/i, 
    /Inflow:\s*NGN\s*([\d.]+)/i, 
    /successfully\s*credited\s*with\s*NGN\s*([\d.]+)/i
  ];

  for (const pattern of patterns) {
    const match = cleanBody.match(pattern);
    if (match && match[1]) {
      const amount = parseFloat(match[1]);
      if (!isNaN(amount) && amount > 0) return amount;
    }
  }
  return null;
}

export async function handleSmsBridge(
  job: Job<JobData>,
  whatsappQueue: Queue,
  ai: AIProvider, // Use AI Abstraction
  defaultWhatsAppService: WhatsAppService
): Promise<{ success: boolean, alertId?: string }> {
  const { from: smsSender, orgId, content, timestamp: smsTimestamp } = job.data;
  const body = content.text || '';
  
  if (!orgId) throw new Error('Missing orgId in SMS Bridge job');

  const org = await getOrgById(orgId);
  if (!org) throw new Error(`Org ${orgId} not found for SMS Bridge`);

  const phoneId = org.whatsappPhoneId;

  // 1. Idempotency Check
  const rawIdSource = `${smsTimestamp}_${smsSender}_${body}`;
  const alertId = crypto.createHash('sha256').update(rawIdSource).digest('hex').substring(0, 16);
  const db = getDb();
  const alertDoc = await db.collection('organizations').doc(orgId).collection('sms_alerts').doc(alertId).get();
  
  if (alertDoc.exists) {
    logger.info({ alertId, orgId }, '⏭️ Already processed alert. Skipping.');
    return { success: true, alertId };
  }

  await db.collection('organizations').doc(orgId).collection('sms_alerts').doc(alertId).set({
    from: smsSender,
    body,
    timestamp: new Date(smsTimestamp),
    receivedAt: new Date(),
  });

  // 2. Matching Logic
  let amount = extractAmountFromSMS(body);
  
  // 🎯 AI FALLBACK: If regex fails
  if (amount === null) {
     logger.info({ orgId }, '🔍 Regex failed. Calling AI Abstraction...');
     try {
       const prompt = `Extract the transaction amount as a number only from this Nigerian bank SMS. If no amount is found, return "NULL". SMS: "${body}"`;
       const aiResult = await ai.generateText(prompt, { model: "gemini-3.1-flash-lite-preview" });
       
       const aiText = (aiResult.text || "").trim();
       if (aiText !== "NULL") {
          const parsed = parseFloat(aiText.replace(/[^0-9.]/g, ''));
          if (!isNaN(parsed)) {
             amount = parsed;
             logger.info({ orgId, amount }, '✅ AI extracted amount.');
          }
       }
     } catch (e: any) {
        logger.error({ orgId, error: e.message }, '❌ AI fallback failed.');
     }
  }

  if (amount !== null) {
    if (!org.config?.sovereignBankDetails?.accountNumber) {
       logger.warn({ orgId, alertId }, '⚠️ sovereignBankDetails missing.');
       return { success: true };
    }

    const sovereignAccount = org.config.sovereignBankDetails.accountNumber;
    const isRefill = body.includes(sovereignAccount);

    const tenantWhatsAppService = org.config?.whatsappToken 
      ? new WhatsAppService(org.config.whatsappToken, org.whatsappPhoneId || '', org.config.appSecret) 
      : defaultWhatsAppService;

    if (isRefill) {
       logger.info({ orgId, amount }, '💳 [REFILL MATCH]');
       const result = await topupTenant(orgId, amount, alertId);
       
       if (result && org.config?.adminPhone) {
          const currency = org.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };
          const formattedAmount = formatCurrency(amount, currency.locale, currency.code);
          const formattedBalance = formatCurrency(result.newBalance / 100, currency.locale, currency.code);
          const notificationMsg = `✅ *AI Credit Refill Confirmed*\n\nYour payment of *${formattedAmount}* has been received. New balance: *${formattedBalance}*.`;

          await whatsappQueue.add('process-message', {
            type: 'text',
            orgId: 'system',
            phoneId: org.whatsappPhoneId,
            from: org.config.adminPhone,
            messageId: `BR-${Date.now()}`,
            timestamp: Date.now(),
            content: { text: notificationMsg }
          }, { removeOnComplete: true });
       }
    } else {
       const pendingTx = await findPendingTransaction(orgId, amount);
       if (pendingTx) {
         logger.info({ orgId, amount, txId: pendingTx.id }, '✅ [SALE MATCH]');
         await confirmTransaction(pendingTx.id, alertId);

         const currency = org.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };
         const formattedAmount = formatCurrency(amount, currency.locale, currency.code);

         await whatsappQueue.add('process-message', {
           type: 'text', orgId: orgId, phoneId: phoneId, from: pendingTx.from,
           messageId: `SALE-${Date.now()}`, timestamp: Date.now(),
           content: { text: `✅ *Payment Confirmed!*\n\nWe have received your payment of *${formattedAmount}*. Thank you!` }
         }, { removeOnComplete: true });

         if (org.config?.adminPhone) {
            await whatsappQueue.add('process-message', {
              type: 'text', orgId: 'system', phoneId: phoneId, from: org.config.adminPhone,
              messageId: `BOSS-SALE-${Date.now()}`, timestamp: Date.now(),
              content: { text: `💰 *SALE CONFIRMED!*\n\nCustomer (*${pendingTx.from}*) has just paid *${formattedAmount}*.\nOrder Ref: ${pendingTx.id}` }
            }, { removeOnComplete: true });
         }
       }
    }
  } else if (process.env.MASTER_ADMIN_PHONE) {
     const snitchMsg = `⚠️ *SMS PARSING FAILURE*\n\nOrg: ${org.name} (${orgId})\nSender: ${smsSender}\n\n*Body:* ${body}`;
     await whatsappQueue.add('process-message', {
        type: 'text', orgId: 'system', phoneId: process.env.WHATSAPP_PHONE_ID || '', 
        from: process.env.MASTER_ADMIN_PHONE, messageId: `SNITCH-${Date.now()}`,
        timestamp: Date.now(), content: { text: snitchMsg }
     }, { removeOnComplete: true });
  }

  return { success: true, alertId };
}
