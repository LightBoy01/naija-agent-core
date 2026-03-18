import { Job } from 'bullmq';
import { WhatsAppService } from '../services/whatsapp.js';
import { 
  getAbandonedCarts, 
  markCartNudged, 
  getLowStockItems,
  getOrgById,
  getActiveOrganizations,
  getUpcomingBookingsForReminders,
  markReminderSent,
  deductBalance
} from '@naija-agent/firebase';
import { Product, SystemConfig } from '@naija-agent/types';
import { formatInTimeZone } from 'date-fns-tz';
import { logger } from '../utils/logger.js';

/**
 * HOURLY: Scans for abandoned carts and sends gentle reminders.
 * Nudge Strategy: Only nudge if cart inactive for >30 mins and <2 hours.
 */
export async function handleCartRecovery(job: Job) {
  // 1. Fetch carts that need nudging
  const abandonedSessions = await getAbandonedCarts(120, 30); // Max 2 hours old, Min 30 mins old
  
  const results = { nudged: 0, errors: 0 };

  for (const session of abandonedSessions) {
    try {
      const org = await getOrgById(session.orgId);
      if (!org || !org.isActive) continue;

      const waService = new WhatsAppService(
        org.config?.whatsappToken || process.env.WHATSAPP_API_TOKEN!,
        org.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID!,
        org.config?.appSecret
      );

      // 2. Send Nudge
      const nudgeMsg = `👋 *Forgotten Something?*\n\nOga, I kept your items safe for you. Stock is moving fast o!\n\nType *CHECKOUT* to complete your order now.`;
      
      await waService.sendText(session.userPhone, nudgeMsg);
      
      // 3. Mark as nudged to prevent spam
      await markCartNudged(session.chatId);
      
      results.nudged++;
    } catch (e: any) {
      logger.error({ chatId: session.chatId, error: e.message }, 'Failed to nudge cart');
      results.errors++;
    }
  }

  return { success: true, ...results };
}

/**
 * HOURLY: Scans for upcoming appointments (24 hours away) and sends reminders.
 */
export async function handleReminderScan(job: Job) {
  const activeOrgs = await getActiveOrganizations();
  const results = { sent: 0, errors: 0 };

  for (const org of activeOrgs) {
    try {
      const orgTimeZone = org.timezone || SystemConfig.DEFAULTS.TIMEZONE;
      
      // 🛡️ [PHASE 8]: Business Hours Guard (Only send reminders between 8 AM and 8 PM local time)
      const currentLocalHour = parseInt(formatInTimeZone(new Date(), orgTimeZone, 'H'));
      if (currentLocalHour < 8 || currentLocalHour >= 20) {
        continue;
      }

      // Look for bookings starting in 23-25 hours (approx 24h notice)
      const upcoming = await getUpcomingBookingsForReminders(org.id, 23 * 60, 25 * 60);
      
      if (upcoming.length === 0) continue;

      const waService = new WhatsAppService(
        org.config?.whatsappToken || process.env.WHATSAPP_API_TOKEN!,
        org.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID!,
        org.config?.appSecret
      );

      for (const booking of upcoming) {
        // Format time in business timezone
        const startTime = new Date(booking.metadata.startTime);
        const timeString = formatInTimeZone(startTime, orgTimeZone, 'hh:mm a');
        
        const reminder = `📅 *Appointment Reminder*\n\nHello! Just reminding you of your booking for *tomorrow at ${timeString}*.\n\n*Service:* ${booking.summary}\n\nSee you soon!`;
        
        await waService.sendText(booking.customerPhone, reminder);
        await markReminderSent(org.id, booking.id);
        results.sent++;
      }

    } catch (e: any) {
      logger.error({ orgId: org.id, error: e.message }, 'Failed appointment scan');
      results.errors++;
    }
  }
  return { success: true, ...results };
}

/**
 * DAILY: Checks inventory levels and alerts the Boss if stock is low.
 */
export async function handleInventoryCleanup(job: Job) {
  const activeOrgs = await getActiveOrganizations();
  const results = { alerts: 0, errors: 0 };

  for (const org of activeOrgs) {
    try {
      const orgTimeZone = org.timezone || SystemConfig.DEFAULTS.TIMEZONE;
      
      // 🛡️ [PHASE 8]: Daily 9 AM Guard (Prevent Hourly Spam)
      const currentLocalHour = parseInt(formatInTimeZone(new Date(), orgTimeZone, 'H'));
      
      if (currentLocalHour !== 9) {
         continue; 
      }

      if (!org.config?.adminPhone) continue;

      const lowStockItems = await getLowStockItems(org.id);
      if (lowStockItems.length === 0) continue;

      const waService = new WhatsAppService(
        org.config?.whatsappToken || process.env.WHATSAPP_API_TOKEN!,
        org.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID!,
        org.config?.appSecret
      );

      const itemsList = lowStockItems.map((p: Product) => `- ${p.name}: ${p.stock} left`).join('\n');
      const alert = `📉 *LOW STOCK ALERT*\n\nOga, these items are running low:\n\n${itemsList}\n\nPlease restock soon!`;

      await waService.sendText(org.config.adminPhone, alert);
      results.alerts++;

    } catch (e: any) {
      logger.error({ orgId: org.id, error: e.message }, 'Failed low stock scan');
      results.errors++;
    }
  }
  return { success: true, ...results };
}

/**
 * SCHEDULER: Sends a one-off scheduled reminder.
 * Triggered by the 'schedule_reminder' tool via BullMQ delay.
 */
export async function handleScheduledReminder(job: Job, defaultWhatsAppService: WhatsAppService) {
  const { orgId, to, message } = job.data;
  
  try {
    const org = await getOrgById(orgId);
    if (!org || !org.isActive) return { success: false, reason: 'Org inactive or missing' };

    // --- BALANCE CHECK & DEDUCTION (PHASE 8 HARDENING) ---
    const cost = org.costPerReply || SystemConfig.COSTS.REPLY_KOBO;
    if (org.balance < cost) {
       logger.warn({ orgId }, '⚠️ [SCHEDULER] Skipping reminder: Low balance.');
       return { success: false, reason: 'Low balance' };
    }

    const result = await deductBalance(orgId, cost);
    if (result === null) throw new Error('Balance deduction failed');

    const waService = org?.config?.whatsappToken 
      ? new WhatsAppService(org.config.whatsappToken, org.whatsappPhoneId!, org.config.appSecret)
      : defaultWhatsAppService;

    const reminderMsg = `⏰ *REMINDER*\n\n${message}`;
    await waService.sendText(to, reminderMsg);
    
    return { success: true, message: 'Reminder sent' };
  } catch (e: any) {
    logger.error({ orgId, error: e.message }, 'Failed to send scheduled reminder');
    throw e; // Retry
  }
}
