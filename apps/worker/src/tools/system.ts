import { Type } from '@google/genai';
import { logger } from "../utils/logger.js";
import { HandlerContext } from './definitions.js';

export const SYSTEM_TOOLS = [
  {
    name: "register_trial_interest",
    description: "Captures a new lead's interest in a free setup trial. (Master Bot Only, Publicly Available)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING, description: "Organization slug (e.g. kudirat_kitchen)" },
        name: { type: Type.STRING, description: "Business display name" },
        adminPhone: { type: Type.STRING, description: `The Boss's personal WhatsApp (e.g. 23480000000)` },
        botPhone: { type: Type.STRING, description: `The new SIM number for the bot (e.g. 23480000000)` },
        timezone: { type: Type.STRING, description: "Business timezone (e.g. Africa/Lagos, America/New_York). Default: Africa/Lagos" }
      },
      required: ["id", "name", "adminPhone", "botPhone"]
    }
  },
  {
    name: "create_tenant",
    description: "Onboards a new client business. (Sovereign Only)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING, description: "Unique slug" },
        name: { type: Type.STRING, description: "Display name" },
        adminPhone: { type: Type.STRING, description: "Boss phone" },
        phoneId: { type: Type.STRING, description: "WhatsApp Phone ID" },
        prompt: { type: Type.STRING, description: "AI personality" },
        timezone: { type: Type.STRING, description: "Business timezone (e.g. Africa/Lagos)" }
      },
      required: ["id", "name", "adminPhone", "phoneId", "prompt"]
    }
  },
  {
    name: "get_network_stats",
    description: "Retrieves network-wide stats. (Sovereign Only)",
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: "suspend_tenant",
    description: "Instantly freezes a tenant account. (Sovereign Only)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tenantId: { type: Type.STRING, description: "Organization slug to suspend" },
        reason: { type: Type.STRING, description: "Reason for suspension (e.g. Debt, Fraud)" },
        mfa_code: { type: Type.STRING, description: "Approval code for suspension (If requested)." }
      },
      required: ["tenantId", "reason"]
    }
  },
  {
    name: "generate_login_code",
    description: "Generates a 6-digit dashboard login code. (Sovereign Only)",
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: "topup_tenant",
    description: `Tops up a tenant's credit balance. (Sovereign Only)`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        tenantId: { type: Type.STRING, description: "Organization slug (e.g. bims_gadgets)" },
        amount: { type: Type.NUMBER, description: `Amount in Naira (e.g. 5000)` },
        reference: { type: Type.STRING, description: "Unique payment reference/session ID." }
      },
      required: ["tenantId", "amount", "reference"]
    }
  },
  {
    name: "broadcast_to_bosses",
    description: "Sends a broadcast message to all business owners in the network. (Sovereign Only)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        message: { type: Type.STRING, description: "The message to send to all Bosses." },
        mfa_code: { type: Type.STRING, description: "Approval code for high-stakes broadcast (If requested)." }
      },
      required: ["message"]
    }
  },
  {
    name: "audit_tenant",
    description: "Retrieves a deep audit of a specific tenant (health, balance, recent errors). (Sovereign Only)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tenantId: { type: Type.STRING, description: "Organization slug to audit." }
      },
      required: ["tenantId"]
    }
  },
  {
    name: "report_fraud",
    description: "Adds a phone number to the global network-wide fraud blacklist. (Sovereign Only)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        phone: { type: Type.STRING, description: `Customer phone number (e.g. 23480000000)` },
        reason: { type: Type.STRING, description: "Reason for blacklisting (e.g. Fake Receipt)" }
      },
      required: ["phone", "reason"]
    }
  },
  {
    name: "request_otp_relay",
    description: "Initiates the 5-minute remote OTP relay for a specific tenant. (Sovereign Only)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tenantId: { type: Type.STRING, description: "Organization slug" },
        phoneId: { type: Type.STRING, description: "The Meta WhatsApp Phone ID" },
        accessToken: { type: Type.STRING, description: "The temporary or permanent Meta access token" },
        wabaId: { type: Type.STRING, description: "The WhatsApp Business Account ID" }
      },
      required: ["tenantId", "phoneId", "accessToken", "wabaId"]
    }
  },
  {
    name: "activate_tenant",
    description: "Finalizes activation after Meta OTP is verified. (Sovereign Only)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tenantId: { type: Type.STRING, description: "Organization slug" },
        phoneId: { type: Type.STRING, description: "The Meta WhatsApp Phone ID" },
        accessToken: { type: Type.STRING, description: "The permanent Meta access token" }
      },
      required: ["tenantId", "phoneId", "accessToken"]
    }
  },
  {
    name: "get_pending_setups",
    description: "Retrieves a list of all businesses waiting for activation or payment. (Sovereign Only)",
    parameters: { type: Type.OBJECT, properties: {} }
  }
];

import { 
  createTenant, 
  topupTenant, 
  getActiveOrganizations, 
  logSystemEvent, 
  getOrgStats, 
  reportFraud, 
  getDb, 
  registerTrialInterest, 
  getOrgById, 
  activateTenant, 
  getPendingSetups, 
  getNetworkStats, 
  setMfaCode 
} from '@naija-agent/database';
import { WhatsAppService } from '../services/whatsapp.js';
import crypto from 'crypto';

export async function handleSystemTools(name: string, args: any, ctx: HandlerContext): Promise<any> {
  const { orgId, from, isAdmin, whatsappService, redisClient } = ctx;

  switch (name) {
    case 'create_tenant':
      if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      await createTenant({
        id: args.id,
        name: args.name,
        whatsappPhoneId: args.phoneId,
        adminPhone: args.adminPhone,
        adminPin: '0000', // Placeholder for AI tool creation
        systemPrompt: args.prompt,
        timezone: args.timezone
      });
      return { status: 'success', message: `Tenant ${args.id} created.` };

    case 'topup_tenant':
      if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      await topupTenant(args.tenantId, args.amount, args.reference);
      return { status: 'success', message: `Tenant ${args.tenantId} topped up by ${args.amount}.` };

    case 'broadcast_to_bosses': {
        if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        
        // --- SOVEREIGN MFA GUARD ---
        if (!args.mfa_code) {
             const code = Math.floor(100000 + Math.random() * 900000).toString();
             await setMfaCode(orgId, code);
             // Save the pending tool call so the interceptor can resume it
             if (redisClient) {
                 await redisClient.setex(`pending_mfa:${orgId}:${from}`, 300, JSON.stringify({
                     tool: 'broadcast_to_bosses',
                     args
                 }));
             }
             logger.info({ orgId }, '🔐 [SECURITY] Sovereign MFA Challenge generated for Broadcast');
             return { 
                status: 'error', 
                code: 'MFA_REQUIRED', 
                message: `Oga, this action is HIGH STAKES. I've sent a 6-digit MFA code to your terminal. Please provide it to confirm the broadcast.` 
             };
        }

        const orgs = await getActiveOrganizations();
        let count = 0;
        for (const org of orgs) {
          if (org.config?.adminPhone) {
            await whatsappService.sendText(org.config.adminPhone, `👑 *MESSAGE FROM SOVEREIGN*\n\n${args.message}`);
            count++;
          }
        }
        return { status: 'success', count };
    }

    case 'audit_tenant': {
        if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        const stats = await getOrgStats(args.tenantId);
        return { status: 'success', stats };
    }

    case 'report_fraud': {
        if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        // reportFraud signature: (phone, reason)
        await reportFraud(orgId, args.phone, args.reason);
        return { status: 'success', message: 'User added to Global Fraud Guard.' };
    }

    case 'register_trial_interest': {
        // registerTrialInterest signature: ({ id, name, adminPhone, botPhone, timezone })
        await registerTrialInterest({
            id: args.id,
            name: args.name,
            adminPhone: args.adminPhone,
            botPhone: args.botPhone,
            timezone: args.timezone
        });
        return { 
            status: 'success', 
            message: `Great! We've registered your interest for ${args.name}. Your new Bot Phone will be ${args.botPhone}. We've also credited your account with a FREE ₦1,000 Trial Bonus! Proceed to the dashboard to scan the QR code and wake up your AI.` 
        };
    }

    case 'request_otp_relay': {
        if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        const { getDb, organizations, eq } = await import('@naija-agent/database');
        const db = getDb();
        
        // 1. Update Org Config with Meta Credentials
        const org = await db.select().from(organizations).where(eq(organizations.id, args.tenantId));
        if (org.length > 0) {
            const config = (org[0].config as any) || {};
            config.metaAccessToken = args.accessToken;
            config.wabaId = args.wabaId;
            config.sessionStatus = 'AWAITING_OTP';
            config.sessionExpiry = new Date(Date.now() + 300000).toISOString(); // 5 mins

            await db.update(organizations).set({
                whatsappPhoneId: args.phoneId,
                config
            }).where(eq(organizations.id, args.tenantId));
        }

        // 2. Instruct Sidecar to trigger OTP via Master Bot context
        return { 
            status: 'success', 
            message: `OTP Relay Initiated for ${args.tenantId}. Sidecar is now listening for the 6-digit code. Please tell the client to check their phone.` 
        };
    }

    case 'activate_tenant': {
        if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        await activateTenant(args.tenantId, args.phoneId, args.accessToken);
        
        // Push mapping to Redis so sidecar immediately knows about it
        const org = await getOrgById(args.tenantId);
        if (org && org.config?.botPhone) {
            const jid = `${org.config.botPhone}@s.whatsapp.net`;
            if (ctx.redisClient) {
                 await ctx.redisClient.set(`sidecar_map:${jid}`, args.tenantId);
                 await ctx.redisClient.set(`sidecar_map:${org.config.botPhone}`, args.tenantId);
            }
        }
        
        return { status: 'success', message: `Tenant ${args.tenantId} is now LIVE on Meta WhatsApp Cloud API.` };
    }

    case 'get_pending_setups': {
        if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        const pending = await getPendingSetups();
        return { status: 'success', pending };
    }

    case 'get_network_stats': {
        if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        // getNetworkStats signature: (orgId)
        const stats = await getNetworkStats(orgId);
        return { status: 'success', stats };
    }

    case 'generate_login_code': {
        if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        // Save to redis for 5 mins
        await ctx.redisClient.set(`login_code:${from}`, code, 'EX', 300);
        return { status: 'success', code, instructions: "Tell the Boss to use this code on the dashboard." };
    }

    default:
      throw new Error(`Unknown system tool: ${name}`);
  }
}
