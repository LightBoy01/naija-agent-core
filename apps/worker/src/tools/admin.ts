import { Type } from '@google/genai';
import { HandlerContext } from './definitions.js';

export const ADMIN_TOOLS = [
  {
    name: "get_customer_info",
    description: "Retrieves the recent transaction and activity history for a specific customer phone number. (Manager Only)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        phone: { type: Type.STRING, description: `The customer's phone number (e.g. 23480000000)` }
      },
      required: ["phone"]
    }
  },
  {
    name: "review_customer_chat",
    description: "Retrieves the recent chat history (last 20 messages) with a specific customer to diagnose issues. (Manager Only)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        phone: { type: Type.STRING, description: `The customer's phone number (e.g. 23480000000)` }
      },
      required: ["phone"]
    }
  },
  {
    name: "verify_admin_pin",
    description: "Verifies the 4-digit PIN (Only for the Boss).",
    parameters: {
      type: Type.OBJECT,
      properties: { pin: { type: Type.STRING, description: "The 4-digit PIN." } },
      required: ["pin"]
    }
  },
  {
    name: "authorize_staff",
    description: "Authorizes a staff member (Rider/Assistant) via their phone number. (BOSS ONLY)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        phone: { type: Type.STRING, description: `Phone number (e.g. 23480000000)` },
        name: { type: Type.STRING, description: "Staff name" },
        role: { type: Type.STRING, format: "enum", enum: ['rider', 'assistant', 'teacher'], description: "Role" }
      },
      required: ["phone", "name", "role"]
    }
  },
  {
    name: "deactivate_staff",
    description: "Removes staff access. (BOSS ONLY)",
    parameters: {
      type: Type.OBJECT,
      properties: { phone: { type: Type.STRING, description: "Phone number to deactivate" } },
      required: ["phone"]
    }
  },
  {
    name: "set_bot_status",
    description: "Turns the AI agent ON or OFF for customers. (BOSS ONLY)",
    parameters: {
      type: Type.OBJECT,
      properties: { active: { type: Type.BOOLEAN, description: "True to start, False to stop" } },
      required: ["active"]
    }
  },
  {
    name: "send_broadcast",
    description: "Sends a marketing message to recent customers. (BOSS ONLY)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        message: { type: Type.STRING, description: "The marketing message content" },
        target: { type: Type.STRING, format: "enum", enum: ['all', 'recent'], description: "Target group" }
      },
      required: ["message"]
    }
  },
  {
    name: "get_business_report",
    description: "Generates a summary of recent sales, activities, and AI recommendations. (BOSS ONLY)",
    parameters: {
      type: Type.OBJECT,
      properties: { period: { type: Type.STRING, format: "enum", enum: ['daily', 'weekly'], description: "Reporting period" } },
      required: ["period"]
    }
  },
  {
    name: "request_human_handoff",
    description: "Requests human assistance. For customers -> notifies the Boss. For Bosses (on Master Bot) -> notifies Sovereign Support.",
    parameters: {
      type: Type.OBJECT,
      properties: { reason: { type: Type.STRING, description: "Reason for needing a human." } },
      required: ["reason"]
    }
  }
];

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
} from '@naija-agent/firebase';
import { logger } from '../utils/logger.js';

export async function handleAdminTools(name: string, args: any, ctx: HandlerContext): Promise<any> {
  const { orgId, from, isStaff, isAdmin, isAuth, whatsappService, currency } = ctx;

  switch (name) {
    case 'authorize_staff':
      if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      if (!isAuth) return { status: 'error', code: 'AUTH_REQUIRED', message: 'This action is LOCKED. Oga, please type your 4-digit PIN to proceed.' };
      await authorizeStaff(orgId, args.phone, args.name, args.role);
      await whatsappService.sendText(from, `✅ Staff *${args.name}* (${args.role}) authorized.`);
      return { status: 'success' };

    case 'deactivate_staff':
      if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      if (!isAuth) return { status: 'error', code: 'AUTH_REQUIRED', message: 'This action is LOCKED. Oga, please type your 4-digit PIN to proceed.' };
      await deactivateStaff(orgId, args.phone);
      await whatsappService.sendText(from, `✅ Staff with phone *${args.phone}* deactivated.`);
      return { status: 'success' };

    case 'set_bot_status':
      if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      if (!isAuth) return { status: 'error', code: 'AUTH_REQUIRED', message: 'This action is LOCKED. Oga, please type your 4-digit PIN to proceed.' };
      await setOrgActive(orgId, args.active);
      await whatsappService.sendText(from, `✅ AI Agent is now *${args.active ? 'ON' : 'OFF'}*.`);
      return { status: 'success' };

    case 'send_broadcast': {
      if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      if (!isAuth) return { status: 'error', code: 'AUTH_REQUIRED', message: 'This action is LOCKED. Oga, please type your 4-digit PIN to proceed.' };
      
      const chats = await (await getDb()).collection('chats')
        .where('organizationId', '==', orgId)
        .orderBy('lastMessageAt', 'desc')
        .limit(50)
        .get();

      let broadcastCount = 0;
      for (const doc of chats.docs) {
        const chat = doc.data();
        if (chat.userPhone === from) continue;
        await whatsappService.sendText(chat.userPhone, args.message);
        broadcastCount++;
      }
      
      await whatsappService.sendText(from, `✅ Broadcast sent to ${broadcastCount} customers.`);
      return { status: 'success', count: broadcastCount };
    }

    case 'get_business_report': {
      if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      if (!isAuth) return { status: 'error', code: 'AUTH_REQUIRED', message: 'This action is LOCKED. Oga, please type your 4-digit PIN to proceed.' };
      
      const summaries = await getWeeklySummary(orgId);
      const latest = summaries[0] || { totalSales: 0, totalOrders: 0, newCustomers: 0, recommendations: 'No data yet.' };
      
      const report = `
📊 *BUSINESS REPORT (${args.period})*
----------------------------
💰 Total Sales: ${currency.symbol}${latest.totalSales?.toLocaleString() || 0}
📦 Total Orders: ${latest.totalOrders || 0}
👥 New Customers: ${latest.newCustomers || 0}

*AI Recommendations:*
${latest.recommendations || 'Expand your reach!'}
`;
      await whatsappService.sendText(from, report);
      return { status: 'success' };
    }

    case 'verify_admin_pin': {
        if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        const { getOrgById, setAdminAuth } = await import('@naija-agent/database');
        const org = await getOrgById(orgId);
        const bcrypt = await import('bcrypt');
        
        if (org?.config?.adminPin && await bcrypt.compare(args.pin, org.config.adminPin)) {
            await setAdminAuth(orgId, from);
            return { status: 'success', authenticated: true };
        }
        return { status: 'error', message: 'Incorrect PIN' };
    }

    case 'request_human_handoff': {
      const { getOrgById } = await import('@naija-agent/database');
      const adminPhone = (await getOrgById(orgId))?.config?.adminPhone;
      if (adminPhone) {
        await whatsappService.sendText(adminPhone, `🆘 *HUMAN ASSISTANCE REQUESTED*\nFrom: ${from}\nReason: ${args.reason}`);
      }
      return { status: 'success', message: 'Oga, I don inform my boss. Dem go follow you talk soon.' };
    }

    case 'get_customer_info': {
        if (!isStaff && !isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        const activities = await getActivitiesByCustomer(orgId, args.phone, 5);
        const summary = activities.map((a: any) => `- [${a.createdAt || 'recent'}] ${a.type}: ${a.metadata?.message || a.metadata?.status || ''}`).join('\n');
        return { status: 'success', history: summary || 'No recent activity found.' };
    }

    case 'review_customer_chat': {
        if (!isStaff && !isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        const { findOrCreateChat, getChatHistory } = await import('@naija-agent/database');
        const chatId = await findOrCreateChat(orgId, args.phone, 'Customer');
        const history = await getChatHistory(chatId, 20);
        const log = history.map((m: any) => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n');
        return { status: 'success', log };
    }

    case 'get_recent_activities': {
        if (!isStaff && !isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        const activities = await getRecentActivities(orgId, 10);
        const summary = activities.map((a: any) => `- [${a.createdAt || 'recent'}] ${a.type}: ${a.metadata?.message || ''}`).join('\n');
        return { status: 'success', activities: summary };
    }

    default:
      throw new Error(`Unknown admin tool: ${name}`);
  }
}
