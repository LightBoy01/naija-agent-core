import { HandlerContext } from './definitions.js';
import { 
  authorizeStaff, 
  deactivateStaff, 
  getStaff, 
  updateActivity, 
  incrementDailySales, 
  getDb, 
  setOrgActive, 
  getWeeklySummary, 
  verifyAdminPin, 
  setAdminAuth, 
  getActivitiesByCustomer, 
  getRecentActivities,
  getChatHistory // Added
} from '@naija-agent/firebase';
import { Queue } from 'bullmq';
import { parseAndFormatPhone, formatPhoneForDisplay } from '../utils/phone.js';

export async function handleAdminTools(name: string, args: any, ctx: HandlerContext): Promise<any> {
  const { orgId, from, isStaff, isAdmin, whatsappService, redisClient, orgConfig, customerName, currency } = ctx;

  switch (name) {
    // ... (cases remain same until get_recent_activities)
    case 'authorize_staff': {
      const normalizedPhone = parseAndFormatPhone(args.phone, currency.locale?.split('-')[1] as any || 'NG');
      if (!normalizedPhone) return { status: 'error', message: 'Invalid phone number format.' };
      
      await authorizeStaff(orgId, normalizedPhone, args.name, args.role);
      return { status: 'success', code: 'AUTHORIZED', name: args.name, phone: formatPhoneForDisplay(normalizedPhone) };
    }

    case 'deactivate_staff': {
      const normalizedPhone = parseAndFormatPhone(args.phone, currency.locale?.split('-')[1] as any || 'NG');
      if (!normalizedPhone) return { status: 'error', message: 'Invalid phone number format.' };

      await deactivateStaff(orgId, normalizedPhone);
      return { status: 'success', code: 'DEACTIVATED', phone: formatPhoneForDisplay(normalizedPhone) };
    }

    case 'assign_task_to_staff': {
      if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      const normalizedPhone = parseAndFormatPhone(args.staffPhone, currency.locale?.split('-')[1] as any || 'NG');
      if (!normalizedPhone) return { status: 'error', message: 'Invalid staff phone number.' };

      const staffMember = await getStaff(orgId, normalizedPhone);
      if (!staffMember) return { status: 'error', message: 'Staff member not found or inactive.' };

      await updateActivity(orgId, args.activityId, 'task', { 
        status: 'pending', 
        assignedStaffPhone: normalizedPhone,
        summary: `Instruction: ${args.instruction || 'N/A'}`
      });

      const staffMessage = `🚀 *NEW TASK ASSIGNED*\n\nOga has assigned Activity *${args.activityId}* to you.\n\n*Instruction:* ${args.instruction || 'None'}.\n\nGood luck!`;
      await whatsappService.sendText(normalizedPhone, staffMessage);

      return { status: 'success', message: `Task ${args.activityId} assigned to ${staffMember.name}. I have informed them on WhatsApp.` };
    }

    case 'manage_activity': {
      await updateActivity(orgId, args.id, args.type, { 
        status: args.status, 
        summary: args.summary, 
        customerPhone: args.customerPhone,
        amount: args.amount,
        assignedStaffPhone: isStaff ? from : undefined
      });
      
      if (args.type === 'order' && args.status === 'delivered' && args.amount) {
         await incrementDailySales(orgId, Math.round(args.amount * 100));
      }

      if (args.status === 'delivered' && orgConfig?.adminPhone) {
          const staffMember = await getStaff(orgId, from);
          const staffName = staffMember?.name || "A staff member";
          const deliveryPing = `✅ *DELIVERY COMPLETE!*\n\nOga, *${staffName}* has just marked Activity *${args.id}* as delivered.\n\nSummary: ${args.summary || 'N/A'}`;
          await whatsappService.sendText(orgConfig.adminPhone, deliveryPing);
      }

      return { status: 'success', code: 'UPDATED', type: args.type };
    }

    case 'get_staff_tasks': {
      if (!isStaff && !isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      
      const dbInstanceForTasks = getDb();
      const taskSnapshot = await dbInstanceForTasks.collection('organizations').doc(orgId)
        .collection('activities')
        .where('assignedStaffPhone', '==', from)
        .get();

      if (taskSnapshot.empty) {
        return { status: 'success', message: "Oga Rider, you no get any pending task for now. Rest small!" };
      }

      const pendingTasks = taskSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((t: any) => t.status !== 'delivered' && t.status !== 'cancelled');

      if (pendingTasks.length === 0) {
        return { status: 'success', message: "Oga Rider, all your tasks don finish. Correct!" };
      }

      const taskList = pendingTasks.map((t: any, i) => `${i+1}. *${t.id}* [${t.status.toUpperCase()}]\n📝 ${t.summary}`).join('\n\n');
      return { 
        status: 'success', 
        message: `📋 *YOUR PENDING TASKS:*\n\n${taskList}\n\nOga Rider, wetin you wan update? Just tell me the ID.` 
      };
    }

    case 'set_bot_status':
      await setOrgActive(orgId, args.active);
      return { status: 'success', message: `Bot service is now ${args.active ? 'ONLINE' : 'OFFLINE (Maintenance Mode)'}.` };

    case 'get_business_report': {
      const snapshots = await getWeeklySummary(orgId);
      return { status: 'success', data: snapshots, message: 'Here is the report. Please analyze it and provide recommendations.' };
    }

    case 'send_broadcast': {
      if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      
      const chats = await (await getDb()).collection('chats')
        .where('organizationId', '==', orgId)
        .orderBy('lastMessageAt', 'desc')
        .limit(50)
        .get();

      let broadcastCount = 0;
      const bQueue = new Queue('whatsapp-queue', { 
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
        }
      });

      for (const chatDoc of chats.docs) {
        const chatData = chatDoc.data();
        if (chatData.whatsappUserId && !chatData.isOptedOut) {
          await bQueue.add('process-message', {
            type: 'text',
            orgId: 'system',
            phoneId: ctx.whatsappPhoneId,
            from: chatData.whatsappUserId,
            timestamp: Date.now(),
            content: { text: args.message }
          }, { 
            delay: broadcastCount * 5000, 
            removeOnComplete: true 
          });
          broadcastCount++;
        }
      }
      return { status: 'success', message: `Broadcast queued for ${broadcastCount} customers with 5s jitter.` };
    }

    case 'verify_admin_pin': {
      if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      
      const lockoutKey = `lockout:admin_pin:${orgId}:${from}`;
      const pinAttempts = await redisClient.get(lockoutKey);
      
      if (pinAttempts && parseInt(pinAttempts) >= 3) {
        const supportContact = process.env.MASTER_ADMIN_PHONE || 'the network administrator';
        return { 
          status: 'error', 
          code: 'LOCKED_OUT', 
          message: `Too many incorrect attempts. Locked for 1 hour. Please contact support at ${supportContact} if you need help.` 
        };
      }

      const isCorrect = await verifyAdminPin(orgId, args.pin?.toString().trim());
      if (isCorrect) {
        await redisClient.del(lockoutKey);
        await setAdminAuth(orgId, from);
        return { status: 'success', code: 'UNLOCKED', message: 'PIN Verified. Session active for 2 hours.' };
      } else {
        const newAttempts = await redisClient.incr(lockoutKey);
        if (newAttempts === 1) await redisClient.expire(lockoutKey, 3600); // 1 hour lockout
        
        const remaining = 3 - newAttempts;
        
        if (remaining <= 0) {
           if (process.env.MASTER_ADMIN_PHONE) {
              const alert = `🛡️ *SECURITY ALERT: BOSS LOCKOUT*\n\nBoss of *${orgId}* (${from}) has been locked out after 3 failed PIN attempts.\n\nTime: ${new Date().toLocaleString()}\nDuration: 1 Hour`;
              try {
                await whatsappService.sendText(process.env.MASTER_ADMIN_PHONE, alert);
              } catch (snitchErr) {
                console.error('Sovereign Snitch failed:', snitchErr);
              }
           }
        }

        return { status: 'error', code: 'WRONG_PIN', remaining };
      }
    }

    case 'request_human_handoff': {
      if (isAdmin && !orgConfig?.isMaster) {
         return { status: 'error', message: 'Oga, you are the Boss! Why you dey report to yourself?' };
      }

      const targetPhone = orgConfig?.commandCenterGroupId || orgConfig?.adminPhone;
      if (!targetPhone) return { status: 'error', message: 'Support contact not configured.' };

      const isMaster = orgConfig?.isMaster;
      const role = isAdmin ? 'BOSS' : (isStaff ? 'STAFF' : 'CUSTOMER');
      
      const alertMessage = isMaster 
         ? `🆘 *SOVEREIGN SUPPORT REQUEST*\n\nUser: ${from} (${role})\nLink: https://wa.me/${from}\nReason: ${args.reason}\n\nAction Required.`
         : `📣 [HUMAN REQUEST]\n\nCustomer: *${customerName || 'Unknown'}* (${from})\nLink: https://wa.me/${from}\nReason: ${args.reason}\n\nPlease take over!`;

      await whatsappService.sendText(targetPhone, alertMessage);
      
      const reply = isMaster
         ? "I have alerted the Sovereign Support Team. They will contact you shortly."
         : "I've informed a human staff member. They will join this chat soon.";

      return { status: 'success', message: reply };
    }

    case 'get_customer_info': {
      if (!isStaff && !isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      const normalizedPhone = parseAndFormatPhone(args.phone, currency.locale?.split('-')[1] as any || 'NG');
      if (!normalizedPhone) return { status: 'error', message: 'Invalid phone number format.' };

      const customerActivities = await getActivitiesByCustomer(orgId, normalizedPhone);
      if (customerActivities.length === 0) return { status: 'success', message: "I no see any transaction history for this phone number." };
      return { status: 'success', data: customerActivities };
    }

    case 'get_recent_activities': {
      if (!isStaff && !isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      const recentActivities = await getRecentActivities(orgId, args.limit || 10);
      if (recentActivities.length === 0) return { status: 'success', message: "Your activity log is empty for now." };
      return { status: 'success', data: recentActivities };
    }

    case 'review_customer_chat': {
      if (!isStaff && !isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      
      const normalizedPhone = parseAndFormatPhone(args.phone, currency.locale?.split('-')[1] as any || 'NG');
      if (!normalizedPhone) return { status: 'error', message: 'Invalid phone number format.' };

      // Reconstruct Chat ID: {orgId}_{phone}
      const targetChatId = `${orgId}_${normalizedPhone}`;
      const history = await getChatHistory(targetChatId, 20); // Last 20 messages

      if (history.length === 0) {
        return { status: 'success', message: `No chat history found for customer ${formatPhoneForDisplay(normalizedPhone)}.` };
      }

      const formattedLog = history.map(msg => {
         const time = msg.timestamp ? new Date((msg.timestamp as any).toMillis()).toLocaleTimeString() : 'Unknown Time';
         const sender = msg.role === 'user' ? '👤 Customer' : '🤖 Bot';
         const content = msg.type === 'text' ? (msg.content as any).text : `[${msg.type.toUpperCase()}]`;
         return `[${time}] ${sender}: ${content}`;
      }).join('\n');

      return { 
         status: 'success', 
         message: `📜 *CHAT LOG: ${formatPhoneForDisplay(normalizedPhone)}*\n(Last 20 messages)\n\n${formattedLog}\n\nOga, analyze this log to see what happened.` 
      };
    }

    default:
      return null;
  }
}
