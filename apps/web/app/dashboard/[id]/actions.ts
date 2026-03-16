'use server';

import { verifyTenantSession } from '../../../lib/auth';
import { updateActivity, getOrgById, getActivityById, finalizeSale } from '@naija-agent/firebase';
import { revalidatePath } from 'next/cache';
import { ActivityType, ActivityStatus } from '@naija-agent/types';
import { getNotificationQueue } from '../../../lib/queue';

/**
 * UPDATES AN ACTIVITY STATUS FROM THE DASHBOARD
 */
export async function updateActivityStatus(orgId: string, activityId: string, type: string, newStatus: string) {
  await verifyTenantSession(orgId);
  
  try {
    const activity = await getActivityById(orgId, activityId);
    if (!activity) throw new Error("Activity not found");

    // 1. Update Database
    await updateActivity(orgId, activityId, type as ActivityType, { 
      status: newStatus as ActivityStatus,
      updatedAt: new Date()
    });

    // 🛡️ [GAP FIX]: If confirmed, finalize stock (Physical deduction)
    if (newStatus === 'confirmed' && activity.metadata?.cartItems) {
        await finalizeSale(orgId, activity.metadata.cartItems as { productId: string, quantity: number }[]);
        console.log(`✅ [STOCK] Physical deduction finalized via Web Dashboard for ${activityId}`);
    }

    // 2. TRIGGER WHATSAPP NOTIFICATION
    await triggerStatusNotification(orgId, activityId, newStatus);

    revalidatePath(`/dashboard/${orgId}`);
    return { success: true };
  } catch (e: unknown) {
    const error = e as Error;
    console.error(`❌ [DASHBOARD] Update failed:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * QUEUES A WHATSAPP NOTIFICATION VIA BULLMQ
 */
async function triggerStatusNotification(orgId: string, activityId: string, status: string) {
    try {
        const notificationQueue = getNotificationQueue();

        const org = await getOrgById(orgId);
        if (!org) return;

        const activity = await getActivityById(orgId, activityId);
        if (!activity || !activity.customerPhone) return;

        // --- MAP STATUS TO TEMPLATE MESSAGE ---
        let message = "";
        if (status === 'confirmed') message = `✅ *Payment Confirmed!*\n\nOga, we have received your payment for Order ${activityId}. We are packaging it now!`;
        else if (status === 'ready_for_pickup') message = `📦 *Packed & Ready!*\n\nYour order ${activityId} is ready for pickup/delivery.`;
        else if (status === 'in_transit') message = `🚚 *On the Way!*\n\nYour order ${activityId} is now with the Rider. Expect it shortly!`;
        else if (status === 'delivered') message = `✅ *Delivered!*\n\nYour order ${activityId} has been successfully delivered. Thank you for your business!`;

        if (!message) return;

        // 🛡️ [ROUTING FIX]: Set orgId to 'system' to prevent balance deduction for notifications
        await notificationQueue.add('process-message', {
            type: 'text',
            orgId: 'system', 
            phoneId: org.whatsappPhoneId,
            from: activity.customerPhone,
            messageId: `WEB-${Date.now()}`,
            timestamp: Date.now(),
            content: { text: message }
        }, { removeOnComplete: true });

        console.log(`✅ [DASHBOARD] Queued notification job for ${activity.customerPhone}`);
    } catch (e: unknown) {
        const error = e as Error;
        console.warn(`⚠️ [DASHBOARD] Notification queuing failed:`, error.message);
    }
}
