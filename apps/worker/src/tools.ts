import { Type } from '@google/genai';
import { AUTH_REQUIRED_TOOLS } from './tools/definitions.js';
import { CountryCode } from 'libphonenumber-js';
import { getPhoneExample } from './utils/phone.js';
import { SectorPack } from '@naija-agent/types';
import { getLegacyCommerceTools } from './sectors/commerce/legacyTools.js';

/**
 * Defines which tools require 4-digit PIN authentication (Boss Only).
 */
export const PIN_PROTECTED_TOOLS = AUTH_REQUIRED_TOOLS;

export function getTenantTools(
  isAdmin: boolean, 
  isStaff: boolean, 
  isMaster: boolean, 
  hasPayment: boolean,
  orgCurrency: { code: string, symbol: string, locale: string } = { code: 'NGN', symbol: '₦', locale: 'en-NG' },
  orgRegion: CountryCode = 'NG',
  sectorPack?: SectorPack,
  isLegacy: boolean = false
): any[] {
  const allFunctionDeclarations: any[] = [];
  const isManager = isAdmin || isStaff;
  const phoneExample = getPhoneExample(orgRegion);

  // --- SECTOR SPECIFIC TOOLS ---
  if (sectorPack && sectorPack.tools) {
    for (const tool of sectorPack.tools) {
      if ('functionDeclarations' in tool && tool.functionDeclarations) {
        allFunctionDeclarations.push(...tool.functionDeclarations);
      }
    }
  }

  // --- BASE TOOLS (Universal) ---

  // 1. Transaction Verification & Payments (All users)
  allFunctionDeclarations.push({
    name: "get_payment_instructions",
    description: "Returns bank account details for payments (Sales or AI Credit Refills).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        purpose: { type: Type.STRING, format: "enum", enum: ['sale', 'refill'], description: "Purpose: 'sale' (paying the Boss) or 'refill' (buying AI credits from the Sovereign)." }
      },
      required: ["purpose"]
    }
  });

  allFunctionDeclarations.push({
    name: "generate_refill_link",
    description: "Generates a secure Paystack payment link for the Boss to buy AI credits.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        amount: { type: Type.NUMBER, description: `Amount in ${orgCurrency.code} (min 2000)` }
      },
      required: ["amount"]
    }
  });

  if (hasPayment) {
    allFunctionDeclarations.push({
      name: "verify_transaction",
      description: "Verifies a bank transaction with the payment provider.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          reference: { type: Type.STRING, description: "Transaction Reference or Session ID" },
          amount: { type: Type.NUMBER, description: `Amount in ${orgCurrency.code}` },
          bankName: { type: Type.STRING, description: "Name of the sending bank" },
          date: { type: Type.STRING, description: "Transaction date/time" },
          purpose: { type: Type.STRING, format: "enum", enum: ['sale', 'refill'], description: "Context of the payment: 'sale' for customers, 'refill' for Boss topping up AI credits." },
          isSuspicious: { type: Type.BOOLEAN, description: "Set to true if you detect ANY Photoshop or editing artifacts in the image." },
          suspicionReason: { type: Type.STRING, description: "If suspicious, describe exactly what looks fake (e.g., font mismatch, blurred digits)." }
        },
        required: ["reference", "amount", "purpose"]
      } as any
    });
  }

  allFunctionDeclarations.push({
    name: "generate_image",
    description: "Generate a creative image based on a text description. Use this when the user asks to see something, create an image, or design a logo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: {
          type: Type.STRING,
          description: "The detailed description of the image to generate (e.g., 'A futuristic Lagos at night with flying danfo buses')."
        }
      },
      required: ["prompt"]
    }
  });

  // --- LEGACY & FALLBACK TOOLS ---
  // Only inject legacy tools if NO sector pack is provided OR if explicitly whitelisted as legacy
  if (!sectorPack || isLegacy) {
      const legacyTools = getLegacyCommerceTools(isAdmin, isStaff, orgCurrency, orgRegion);
      allFunctionDeclarations.push(...legacyTools);
  }

  // 2. Manager Tools (BOSS & STAFF)
  if (isManager) {
    // Universal Manager Tools
    allFunctionDeclarations.push({
      name: "web_search",
      description: "Searches the live internet for real-time information (Exchange rates, market prices, news).",
      parameters: {
        type: Type.OBJECT,
        properties: { query: { type: Type.STRING, description: "The search query." } },
        required: ["query"]
      }
    });
    
    allFunctionDeclarations.push({
      name: "get_customer_info",
      description: "Retrieves the recent transaction and activity history for a specific customer phone number. (Manager Only)",
      parameters: {
        type: Type.OBJECT,
        properties: {
          phone: { type: Type.STRING, description: `The customer's phone number (e.g. ${phoneExample}0000000)` }
        },
        required: ["phone"]
      }
    });

    allFunctionDeclarations.push({
      name: "review_customer_chat",
      description: "Retrieves the recent chat history (last 20 messages) with a specific customer to diagnose issues. (Manager Only)",
      parameters: {
        type: Type.OBJECT,
        properties: {
          phone: { type: Type.STRING, description: `The customer's phone number (e.g. ${phoneExample}0000000)` }
        },
        required: ["phone"]
      }
    });
    
    allFunctionDeclarations.push({
      name: "schedule_reminder",
      description: "Schedules a one-off reminder message to be sent to you after a specific delay. (Manager Only)",
      parameters: {
        type: Type.OBJECT,
        properties: {
          message: { type: Type.STRING, description: "The reminder message content (e.g., 'Call John about the waybill')." },
          delaySeconds: { type: Type.NUMBER, description: "How many seconds from now to send the reminder (e.g., 3600 for 1 hour)." }
        },
        required: ["message", "delaySeconds"]
      }
    });

    // Legacy/Fallback Manager Tools (If no sector pack)
    // Handled by getLegacyCommerceTools at the top level
    
    // Strictly Boss-Only Tools
    if (isAdmin) {
      allFunctionDeclarations.push(
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
              phone: { type: Type.STRING, description: `Phone number (${phoneExample})` },
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
          name: "save_knowledge",
          description: "Updates business facts or prices. (Requires Boss Auth)",
          parameters: {
            type: Type.OBJECT,
            properties: {
              key: { type: Type.STRING, description: "Key name" },
              content: { type: Type.STRING, description: "Details/Price" },
              imageUrl: { type: Type.STRING, description: "Product Image URL" }
            },
            required: ["key", "content"]
          }
        },
        {
          name: "delete_knowledge",
          description: "Deletes obsolete business knowledge. (Requires Boss Auth)",
          parameters: {
            type: Type.OBJECT,
            properties: { key: { type: Type.STRING, description: "Key to delete" } },
            required: ["key"]
          }
        }
      );
    }
  }

  // 3. Master Tools (Sovereign Only)
  if (isMaster) {
    allFunctionDeclarations.push({
      name: "register_trial_interest",
      description: "Captures a new lead's interest in a free setup trial. (Master Bot Only, Publicly Available)",
      parameters: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "Organization slug (e.g. kudirat_kitchen)" },
          name: { type: Type.STRING, description: "Business display name" },
          adminPhone: { type: Type.STRING, description: `The Boss's personal WhatsApp (${phoneExample})` },
          botPhone: { type: Type.STRING, description: `The new SIM number for the bot (${phoneExample})` },
          timezone: { type: Type.STRING, description: "Business timezone (e.g. Africa/Lagos, America/New_York). Default: Africa/Lagos" }
        },
        required: ["id", "name", "adminPhone", "botPhone"]
      }
    });
  }

  if (isAdmin && isMaster) {
    allFunctionDeclarations.push(
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
        } as any
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
        description: `Tops up a tenant's credit balance (${orgCurrency.symbol}). (Sovereign Only)`,
        parameters: {
          type: Type.OBJECT,
          properties: {
            tenantId: { type: Type.STRING, description: "Organization slug (e.g. bims_gadgets)" },
            amount: { type: Type.NUMBER, description: `Amount in ${orgCurrency.code} (e.g. 5000)` },
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
            phone: { type: Type.STRING, description: `Customer phone number (${phoneExample})` },
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
    );
  }

  // 4. Escalation & Support (All Users)
  allFunctionDeclarations.push({
    name: "request_human_handoff",
    description: "Requests human assistance. For customers -> notifies the Boss. For Bosses (on Master Bot) -> notifies Sovereign Support.",
    parameters: {
      type: Type.OBJECT,
      properties: { reason: { type: Type.STRING, description: "Reason for needing a human." } },
      required: ["reason"]
    }
  });

  return [{ functionDeclarations: allFunctionDeclarations }];
}
