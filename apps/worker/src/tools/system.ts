import { Type } from '@google/genai';
import { logger } from "../utils/logger.js";
import { HandlerContext } from './definitions.js';
import axios from 'axios';

export const SYSTEM_TOOLS = [
  {
    name: "toggle_demo_mode",
    description: "Switches Zynux into a Sandbox Demo Bot for a specific niche to showcase the system to a client.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        niche: { type: Type.STRING, description: "The business niche to roleplay (e.g. electronics, boutique, pharmacy). Send 'null' to exit demo mode." }
      },
      required: ["niche"]
    }
  },
  {
    name: "mock_checkout",
    description: "Generates a fake invoice during Demo Mode to show the client how checkout works. Does NOT actually bill anyone.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        items: { type: Type.STRING, description: "List of items the user is buying in the demo" },
        total: { type: Type.NUMBER, description: "Fake total amount" }
      },
      required: ["items", "total"]
    }
  },
  {
    name: "register_trial_interest",
    description: "Captures a new lead's interest in a free setup trial. (Master Bot Only, Publicly Available)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING, description: "Organization slug (e.g. kudirat_kitchen)" },
        name: { type: Type.STRING, description: "Business display name" },
        adminPhone: { type: Type.STRING, description: `The Boss's personal WhatsApp (e.g. 23480000000)` },
        botPhone: { type: Type.STRING, description: `The new dedicated WhatsApp number (e.g. 23480000000)` },
        timezone: { type: Type.STRING, description: "Timezone, e.g. 'Africa/Lagos'" },
        referralPhone: { type: Type.STRING, description: "Optional. The phone number of the Partner/Coach who referred them." }
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
        ...(process.env.ENFORCE_MFA === 'true' ? { mfa_code: { type: Type.STRING, description: "Approval code for suspension (If requested)." } } : {})
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
    name: "mock_product_info",
    description: "Returns fake product catalog information for the demo niche. Use this to look up a product the client is asking about or wants to see priced, so you can give them a realistic quote.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        productName: { type: Type.STRING, description: "The product name the client is asking about (e.g. gucci bag, paracetamol, iphone 15)" },
      },
      required: ["productName"]
    }
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
        ...(process.env.ENFORCE_MFA === 'true' ? { mfa_code: { type: Type.STRING, description: "Approval code for high-stakes broadcast (If requested)." } } : {})
      },
      required: ["message"]
    }
  },
  {
    name: "send_direct_message",
    description: "Sends a direct WhatsApp message to any phone number. (Sovereign Only)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        phone: { type: Type.STRING, description: `The recipient's phone number (e.g. 23480000000)` },
        message: { type: Type.STRING, description: "The message to send." }
      },
      required: ["phone", "message"]
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
    name: "request_sidecar_pairing",
    description: "Initiates the 8-character pairing code flow for a sidecar-based bot. (Sovereign Only)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tenantId: { type: Type.STRING, description: "Organization slug (e.g. aelixxr)" },
        phone: { type: Type.STRING, description: "Phone number in international format without + (e.g. 2348030000000)" }
      },
      required: ["tenantId", "phone"]
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
  },
  {
    name: "get_partner_stats",
    description: "Retrieves the referral and earnings statistics for a partner. (Sovereign Only)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        partnerPhone: { type: Type.STRING, description: "The partner's phone number (e.g. 23480000000)" }
      },
      required: ["partnerPhone"]
    }
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
  setMfaCode,
  findOrCreateChat,
  setChatDemoState,
  suspendOrganization,
  getPartnerStats,
  isRegisteredPartner
} from '@naija-agent/database';
import {
  createTenant as fbCreateTenant,
  registerTrialInterest as fbRegisterTrialInterest,
  activateTenant as fbActivateTenant
} from '@naija-agent/firebase';
import { WhatsAppService } from '../services/whatsapp.js';
import crypto from 'crypto';

export async function handleSystemTools(name: string, args: any, ctx: HandlerContext): Promise<any> {
  const { orgId, from, isAdmin, whatsappService, redisClient } = ctx;

  switch (name) {
    case 'toggle_demo_mode': {
      const chatId = await findOrCreateChat(orgId, from, 'User');
      if (args.niche === 'null' || !args.niche) {
          await setChatDemoState(chatId, null);
          return { status: 'success', message: 'Demo mode deactivated. You are now Zynux again.' };
      } else {
          await setChatDemoState(chatId, args.niche);
          return { status: 'success', message: `Demo mode activated for niche: ${args.niche}. Begin roleplaying immediately.` };
      }
    }

    case 'mock_checkout': {
      return { 
        status: 'success', 
        message: 'Mock invoice generated successfully.',
        invoice: `*MOCK INVOICE*\nItems: ${args.items}\nTotal: ${args.total}\nPayment Link: https://mock-pay.naija-agent.com/demo`
      };
    }

    case 'mock_product_info': {
      const items: Record<string, { price: string, description: string }> = {
        'paracetamol': { price: '₦500', description: 'Pain relief tablets, 100mg pack of 20' },
        'amoxicillin': { price: '₦1,200', description: 'Antibiotic capsules, 500mg pack of 14' },
        'vitamin c': { price: '₦800', description: 'Immune boost supplement, 30 tablets' },
        'malaria drug': { price: '₦2,500', description: 'ACT malaria treatment, 24-tablet course' },
        'face cream': { price: '₦3,500', description: 'Moisturizing face cream, 50ml jar' },
        'perfume': { price: '₦8,000', description: 'Designer-inspired fragrance, 100ml bottle' },
        'iphone 15': { price: '₦750,000', description: 'Apple iPhone 15, 128GB — brand new sealed' },
        'samsung s24': { price: '₦650,000', description: 'Samsung Galaxy S24, 256GB — dual SIM' },
        'airpods': { price: '₦45,000', description: 'Apple AirPods Pro 2nd Gen — original' },
        'gucci bag': { price: '₦120,000', description: 'Gucci GG Marmont mini bag — authentic' },
        'nike air max': { price: '₦35,000', description: 'Nike Air Max 90 — original, size 42' },
        'smart tv': { price: '₦180,000', description: '43-inch 4K Smart TV, built-in Netflix' },
        'generator': { price: '₦95,000', description: '2.5KVA petrol generator, super quiet' },
        'rice': { price: '₦42,000', description: 'Foreign parboiled rice, 50kg bag' },
        'groundnut oil': { price: '₦8,500', description: 'Pure groundnut oil, 5 litres' },
      };

      const key = args.productName?.toLowerCase().trim() || '';
      const match = items[key];
      if (match) {
        return {
          status: 'success',
          product: {
            name: args.productName,
            price: match.price,
            description: match.description,
            availability: 'In stock',
          },
          message: `Found ${args.productName}: ${match.description} — ${match.price}. In stock!`
        };
      }

      // Generate a plausible fake entry if not in the preset list
      const fakePrice = `₦${(Math.floor(Math.random() * 200) + 5) * 1000}`;
      return {
        status: 'success',
        product: {
          name: args.productName,
          price: fakePrice,
          description: `Premium ${args.productName} — quality assured`,
          availability: 'In stock (limited units)',
        },
        message: `${args.productName} — ${fakePrice}. Limited stock available!`
      };
    }

    case 'create_tenant':
      if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      await Promise.all([
        createTenant({
          id: args.id,
          name: args.name,
          whatsappPhoneId: args.phoneId,
          adminPhone: args.adminPhone,
          adminPin: '0000', // Placeholder for AI tool creation
          systemPrompt: args.prompt,
          timezone: args.timezone
        }),
        fbCreateTenant({
          id: args.id,
          name: args.name,
          whatsappPhoneId: args.phoneId,
          adminPhone: args.adminPhone,
          adminPin: '0000', // Placeholder for AI tool creation
          systemPrompt: args.prompt,
          timezone: args.timezone
        })
      ]);
      return { status: 'success', message: `Tenant ${args.id} created.` };

    case 'topup_tenant':
      if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      await topupTenant(args.tenantId, args.amount, args.reference);
      return { status: 'success', message: `Tenant ${args.tenantId} topped up by ${args.amount}.` };

    case 'broadcast_to_bosses': {
        if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        
        // --- SOVEREIGN MFA GUARD (Temporarily disabled unless ENFORCE_MFA is set) ---
        if (process.env.ENFORCE_MFA === 'true' && !args.mfa_code) {
             const code = Math.floor(100000 + Math.random() * 900000).toString();
             await setMfaCode(orgId, code);
             // Save the pending tool call so the interceptor can resume it
             if (redisClient) {
                 await redisClient.setex(`pending_mfa:${orgId}:${from}`, 300, JSON.stringify({
                     tool: 'broadcast_to_bosses',
                     args
                 }));
             }
             logger.info({ orgId, code }, `🔐 [SECURITY] Sovereign MFA Challenge: ${code}`);
             return { 
                status: 'error', 
                code: 'MFA_REQUIRED', 
                message: `Oga, this action is HIGH STAKES. I've sent a 6-digit MFA code to your terminal. Please provide it to confirm the broadcast.` 
             };
        }

        const orgs = await getActiveOrganizations();
        let count = 0;
        for (const org of orgs) {
          if ((org.config as any)?.adminPhone) {
            await whatsappService.sendText((org.config as any).adminPhone, `👑 *MESSAGE FROM SOVEREIGN*\n\n${args.message}`);
            count++;
          }
        }
        return { status: 'success', count };
    }

    case 'send_direct_message': {
        if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        try {
            await ctx.whatsappService.sendText(args.phone, args.message);
            return { status: 'success', message: `Message successfully sent to ${args.phone}` };
        } catch (e: any) {
            return { status: 'error', message: `Failed to send message: ${e.message}` };
        }
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

    case 'suspend_tenant': {
        if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        await suspendOrganization(args.tenantId, args.reason);
        return { status: 'success', message: `Tenant ${args.tenantId} has been suspended. Reason: ${args.reason}` };
    }

    case 'register_trial_interest': {
        const { parseAndFormatPhone } = await import('@naija-agent/types');

        if (args.referralPhone) {
            const normalizedRef = parseAndFormatPhone(args.referralPhone) || args.referralPhone;
            const normalizedAdmin = parseAndFormatPhone(args.adminPhone) || args.adminPhone;
            const normalizedBot = parseAndFormatPhone(args.botPhone) || args.botPhone;
            
            if (normalizedRef === normalizedAdmin || normalizedRef === normalizedBot) {
                logger.warn({ orgId: args.id, ref: args.referralPhone }, '🛑 [REFERRAL] Blocked self-referral attempt.');
                args.referralPhone = null;
            } else {
                const isValid = await isRegisteredPartner(args.referralPhone);
                if (!isValid) {
                    logger.warn({ orgId: args.id, ref: args.referralPhone }, '🛑 [REFERRAL] Blocked invalid/unregistered partner phone.');
                    args.referralPhone = null;
                }
            }
        }

        let isBetaCohort = false;
        let betaExpiresAt = undefined;
        if (ctx.redisClient) {
            const isBeta = await ctx.redisClient.get(`referral_beta:${ctx.from}`);
            if (isBeta === 'true') {
                isBetaCohort = true;
                betaExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
            }
        }

        // 1. Register in Database
        try {
            await Promise.all([
              registerTrialInterest({
                  id: args.id,
                  name: args.name,
                  adminPhone: args.adminPhone,
                  botPhone: args.botPhone,
                  timezone: args.timezone,
                  referralPhone: args.referralPhone,
                  isBetaCohort,
                  betaExpiresAt
              }),
              fbRegisterTrialInterest({
                  id: args.id,
                  name: args.name,
                  adminPhone: args.adminPhone,
                  botPhone: args.botPhone,
                  timezone: args.timezone,
                  referralPhone: args.referralPhone
              })
            ]);
        } catch (error: any) {
            if (error.message && error.message.includes('unique constraint')) {
                return { status: 'error', reason: `Organization ID '${args.id}' already exists. Please choose a different ID.` };
            }
            throw error;
        }

        // 2. Normalize Phone and Set Redis Mapping (for Sidecar routing)
        const normalizedBotPhone = parseAndFormatPhone(args.botPhone);
        if (normalizedBotPhone && ctx.redisClient) {
            const rawPhone = normalizedBotPhone.replace('+', '');
            const jid = `${rawPhone}@s.whatsapp.net`;
            await ctx.redisClient.set(`sidecar_map:${jid}`, args.id);
            await ctx.redisClient.set(`sidecar_map:${rawPhone}`, args.id);
            logger.info({ orgId: args.id, jid }, '🔗 [AUTO-ONBOARDING] Hydrated sidecar mapping in Redis');
        }

        // 3. Automatically request WhatsApp Pairing Code from Sidecar
        const sidecarUrl = process.env.WHATSAPP_SIDECAR_URL || 'http://localhost:8080';
        const apiKey = process.env.ADMIN_API_KEY;
        
        let pairingCodeMsg = "";
        try {
            const response = await axios.post(
                `${sidecarUrl}/pair`,
                { orgId: args.id, phone: args.botPhone },
                {
                    headers: {
                        'X-API-Key': apiKey || '',
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data.code) {
                pairingCodeMsg = `\n\n🔑 *YOUR PAIRING CODE:* ${response.data.code}\n\n👉 *To Activate:* Go to your Bot Phone's WhatsApp > Linked Devices > Link with phone number instead, and enter this code.`;
            }
        } catch (e: any) {
            logger.error({ error: e.response?.data || e.message, orgId: args.id }, '❌ [AUTO-PAIR] Failed during trial registration');
        }

        const bonusCredits = args.referralPhone ? 50 : 10;
        const bonusNaira = args.referralPhone ? 500 : 100;
        return { 
            status: 'success', 
            message: `Great! We've registered your interest for ${args.name}. Your new Bot Phone will be ${args.botPhone}. Because you ${args.referralPhone ? 'used a VIP Partner link, you' : ''} have been credited with ${bonusCredits} free setup credits (₦${bonusNaira})!${pairingCodeMsg || ' Proceed to the dashboard to scan the QR code and wake up your AI.'}` 
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

    case 'request_sidecar_pairing': {
        if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        
        const sidecarUrl = process.env.WHATSAPP_SIDECAR_URL || 'http://localhost:8080';
        const apiKey = process.env.ADMIN_API_KEY;

        try {
            const response = await axios.post(
                `${sidecarUrl}/pair`,
                { orgId: args.tenantId, phone: args.phone },
                {
                    headers: {
                        'X-API-Key': apiKey || '',
                        'Content-Type': 'application/json'
                    }
                }
            );

            return { 
                status: 'success', 
                code: response.data.code,
                message: `Pairing Code Generated: ${response.data.code}. Please tell the user to enter this code in their WhatsApp (Linked Devices > Link with phone number instead).`
            };
        } catch (e: any) {
            logger.error({ error: e.response?.data || e.message }, '❌ [SIDECAR PAIR] Failed');
            return { status: 'error', message: `Failed to initiate sidecar pairing: ${e.message}` };
        }
    }

    case 'activate_tenant': {
        if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        await Promise.all([
          activateTenant(args.tenantId, args.phoneId, args.accessToken),
          fbActivateTenant(args.tenantId, args.phoneId, args.accessToken)
        ]);
        
        // Push mapping to Redis so sidecar immediately knows about it
        const org = await getOrgById(args.tenantId);
        if (org && (org.config as any)?.botPhone) {
            const jid = `${(org.config as any).botPhone}@s.whatsapp.net`;
            if (ctx.redisClient) {
                 await ctx.redisClient.set(`sidecar_map:${jid}`, args.tenantId);
                 await ctx.redisClient.set(`sidecar_map:${(org.config as any).botPhone}`, args.tenantId);
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

    case 'get_partner_stats': {
        if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
        const stats = await getPartnerStats(args.partnerPhone);
        return { status: 'success', stats, instructions: "Present these stats clearly to the partner." };
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
