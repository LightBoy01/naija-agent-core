import { Job } from 'bullmq';
import { JobData, SystemConfig } from '@naija-agent/types';
import { WhatsAppService } from '../services/whatsapp.js';
import { 
  getOrgById, 
  getOrgDailyStats, 
  getPotentialSalesValue, 
  logSystemEvent, 
  getOrgOnboarding 
} from '@naija-agent/firebase';
import { formatInTimeZone } from 'date-fns-tz';
import { PaymentProvider } from '@naija-agent/payments';
import { formatCurrency } from '../utils/currency.js';
import { logger } from '../utils/logger.js';

export async function handleDailyReport(
  job: Job<JobData>, 
  paymentProvider: PaymentProvider | null
): Promise<{ success: boolean }> {
  const { orgId } = job.data;
  if (!orgId) throw new Error('Missing orgId for daily-report job');
  
  const org = await getOrgById(orgId);
  if (!org || !org.config?.adminPhone) {
     logger.warn({ orgId }, `[DAILY REPORT] Org not found or missing adminPhone. Skipping.`);
     return { success: true };
  }

  // 1. Staggered Jitter (Melt-down protection)
  const jitterMs = Math.floor(Math.random() * 600 * 1000); // 0-10 minutes jitter
  logger.info({ orgId, jitterSeconds: Math.floor(jitterMs/1000) }, `[DAILY REPORT] Staggering report`);
  await new Promise(r => setTimeout(r, jitterMs));

  // 🛡️ [PHASE 5.10]: Normalize to Organization TimeZone
  const orgTimeZone = org.timezone || SystemConfig.DEFAULTS.TIMEZONE;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = formatInTimeZone(yesterday, orgTimeZone, 'yyyy-MM-dd');
  const currency = org.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };

  try {
    const { getLowStockItems, getNetworkHealthInsight, getPotentialSalesValue } = await import('@naija-agent/firebase');
    const stats = await getOrgDailyStats(org.id, dateStr);
    const potentialSalesKobo = await getPotentialSalesValue(org.id);
    const balanceNaira = (org.balance || 0) / 100;
    const lowStockItems = await getLowStockItems(org.id);
    const networkInsight = await getNetworkHealthInsight(org.id, dateStr);

    let reportMessage = `☀️ *Oga, Good Morning!*\n\n` +
      `Here is your ${org.name} summary for yesterday (*${dateStr}*):\n\n` +
      `💰 *Confirmed Sales:* ${formatCurrency(stats.salesKobo / 100, currency.locale, currency.code)}\n` +
      `📈 *Potential Sales:* ${formatCurrency(potentialSalesKobo / 100, currency.locale, currency.code)} (Orders pending delivery)\n` +
      `📝 *Pending Activities:* ${stats.pendingActivities}\n` +
      `💳 *Bot Balance:* ${formatCurrency(balanceNaira, currency.locale, currency.code)}\n\n`;

    if (lowStockItems.length > 0) {
      const itemList = lowStockItems.map(p => `- ${p.name} (*Only ${p.stock} left*)`).join('\n');
      reportMessage += `📦 *MORNING RITUAL: RESTOCK ALERT*\n\nOga, these items are almost finished:\n${itemList}\n\n*Pro-tip:* Reply with the SKU and new count (e.g., 'IPHONE-15 10') to update me sharp-sharp! 📈\n\n`;
    }

    // 🏰 [NETWORK EFFECT]: Anonymized Empire Benchmark
    if (networkInsight.totalActiveBots >= 5) {
       const avgSalesNaira = networkInsight.avgSalesKobo / 100;
       const mySalesNaira = stats.salesKobo / 100;
       
       if (mySalesNaira > avgSalesNaira) {
          reportMessage += `🏆 *Network Insight:* Oga, your sales were *above the network average* yesterday! Keep crushing it.\n\n`;
       }
    }

    // 💰 [FINANCIAL NUDGE]
    if (balanceNaira < 500) {
       let refillNudge = "";
       const refillAmount = 2000;
       const formattedRefill = formatCurrency(refillAmount, currency.locale, currency.code);

       if (paymentProvider) {
          const refillLink = await paymentProvider.createPaymentLink(org.id, `${org.id}@naijaagent.core`, refillAmount);
          if (refillLink) {
            refillNudge = `💳 *Quick Refill (${formattedRefill}):* \nTap here to pay instantly: \n🔗 ${refillLink}\n\n`;
          }
       }
       if (!refillNudge && org.config?.sovereignBankDetails) {
          const hq = org.config.sovereignBankDetails;
          refillNudge = `🏦 *Bank Refill (Naija Agent HQ):* \n` +
            `Bank: ${hq.bankName}\n` +
            `Account: ${hq.accountNumber}\n` +
            `Name: ${hq.accountName}\n\n` +
            `⚠️ *Ref:* Use "${org.id}" as your transfer note so I can credit you sharp-sharp!\n\n`;
       }
       if (refillNudge) {
          reportMessage += `💳 *LOW BALANCE ALERT:* \nYour balance is low. Please top up to keep me working: \n\n${refillNudge}`;
       }
    }

    reportMessage += `I am ready for another productive day! Any instruction for me?`;
    
    let tenantWhatsAppService = new WhatsAppService(
      org.config?.whatsappToken || process.env.WHATSAPP_API_TOKEN || '',
      org.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID || ''
    );

    await tenantWhatsAppService.sendText(org.config.adminPhone, reportMessage);
    await logSystemEvent(org.id, 'PROACTIVE_REPORT', `Sent morning summary for ${dateStr}`);
    logger.info({ orgId, adminPhone: org.config.adminPhone }, `✅ [DAILY REPORT] Sent to Boss.`);
  } catch (e: any) {
    logger.error({ orgId, error: e.message }, `❌ [DAILY REPORT] Failed.`);
    throw e; // Retry
  }
  return { success: true };
}

export async function handleMasterReport(): Promise<{ success: boolean }> {
  const { getNetworkStats, getDb } = await import('@naija-agent/firebase');
  const masterPhone = process.env.MASTER_ADMIN_PHONE;
  const masterToken = process.env.WHATSAPP_API_TOKEN;
  const masterPhoneId = process.env.WHATSAPP_PHONE_ID;

  if (!masterPhone || !masterToken || !masterPhoneId) {
    logger.warn('⚠️ [MASTER REPORT] Missing Master Admin credentials in env. Skipping.');
    return { success: true };
  }

  try {
    const stats = await getNetworkStats('naija-agent-master');
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const dateStr = yesterdayDate.toISOString().split('T')[0];

    const db = await getDb();
    const historyDoc = await db.collection('network_metadata').doc('global').collection('history').doc(dateStr).get();
    const yesterdayStats = historyDoc.exists ? historyDoc.data() : null;

    const activeBots = stats.clients.filter((c: any) => c.isActive).length;
    const vaultNaira = stats.totalVaultKobo / 100;
    
    let deltaMsg = "";
    if (yesterdayStats) {
       const vaultDelta = vaultNaira - (yesterdayStats.totalVaultKobo / 100);
       const onboardDelta = stats.clients.length - (yesterdayStats.activeClients || 0);
       deltaMsg = `📈 *Growth:* ${onboardDelta > 0 ? '+' + onboardDelta : onboardDelta} shops, ${vaultDelta >= 0 ? '+' : ''}${formatCurrency(vaultDelta)} vault\n`;
    }

    const empireMessage = `🏰 *SOVEREIGN MORNING REPORT*\n\n` +
      `Date: *${dateStr}*\n\n` +
      `🏦 *Vault Balance:* ${formatCurrency(vaultNaira)}\n` +
      `🤖 *Active Bots:* ${activeBots}\n` +
      `🤝 *Total Clients:* ${stats.clients.length}\n` +
      deltaMsg + 
      `\nThe Empire is growing, Oga Boss!`;

    const todayStr = new Date().toISOString().split('T')[0];
    await db.collection('network_metadata').doc('global').collection('history').doc(todayStr).set({
       totalVaultKobo: stats.totalVaultKobo,
       activeClients: stats.clients.length,
       timestamp: new Date()
    });

    const masterWhatsAppService = new WhatsAppService(masterToken, masterPhoneId);
    await masterWhatsAppService.sendText(masterPhone, empireMessage);
    
    logger.info(`✅ [MASTER REPORT] Sent Sovereign pulse with Delta tracking.`);
  } catch (e: any) {
    logger.error({ error: e.message }, `❌ [MASTER REPORT] Failed.`);
    throw e;
  }
  return { success: true };
}
