import { Job } from 'bullmq';
import { JobData, OnboardingConfig, OnboardingData, SystemConfig, ONBOARDING_PROMPTS, parseAndFormatPhone } from '@naija-agent/types';
import { WhatsAppService } from '../services/whatsapp.js';
import { 
  getOrgById, 
  setOrgOnboarding, 
  completeOnboarding, 
  getPendingSetups,
  createTenant,
  activateTenant as fbActivateTenant,
  getDb,
  Organization
} from '@naija-agent/firebase';
import {
  setOrgOnboarding as pgSetOrgOnboarding,
  completeOnboarding as pgCompleteOnboarding,
  createTenant as pgCreateTenant,
  activateTenant as pgActivateTenant,
} from '@naija-agent/database';
import { Redis } from 'ioredis';
import { formatCurrency } from '../utils/currency.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import axios from 'axios';

// ─── PROSPECT FLOW (Sovereign Lead Capture) ─────────────────────────

async function handleProspectFlow(
  redisClient: Redis,
  tenantWhatsAppService: WhatsAppService,
  from: string,
  text: string,
  org: Organization,
): Promise<{ handled: boolean }> {
  const prospectKey = `prospect:${from}`;
  const rawState = await redisClient.get(prospectKey);
  let state = rawState ? JSON.parse(rawState) : null;
  
  let isReferral = false;
  
  if (text.includes('I_want_AI_for_my_business_')) {
    isReferral = true;
    const match = text.match(/I_want_AI_for_my_business_(\d+)/);
    if (match) {
       const referrerPhone = match[1];
       await redisClient.set(`referral:${from}`, referrerPhone, 'EX', 7 * 24 * 60 * 60);
    }
  }

  if (!isReferral && !state) return { handled: false };

  logger.info({ from, step: state?.step }, '🛠️ [PROSPECT FLOW] Processing step');
  
  let nextStep = state?.step || 'START';
  let nextData = state?.data || {};
  let reply = '';

  if (isReferral) {
     nextStep = 'NAME';
     reply = `Oga Boss! Welcome to the Naija Agent Empire! 🚀\n\nI see say you wan get your own Digital Apprentice to help you sell more.\n\nTo start, wetin be the *Name of your Business*? (e.g. Bims Gadgets)`;
  } else if (text.toLowerCase() === '#cancel') {
     await redisClient.del(prospectKey);
     await tenantWhatsAppService.sendText(from, "🛑 Signup cancelled. Message me anytime to start again!");
     return { handled: true };
  } else if (nextStep === 'NAME') {
     if (text.length < 3) {
        reply = "Abeg, type a proper business name.";
     } else {
        nextData.name = text;
        nextStep = 'PIN';
        reply = `Nice name! *${nextData.name}* is going to be big! 🌟\n\nNow, create a *4-digit Admin PIN* to secure your account.\n\n(e.g. 4321)`;
     }
  } else if (nextStep === 'PIN') {
     if (text.length !== 4 || isNaN(parseInt(text))) {
        reply = "Use exactly 4 numbers for your PIN.";
     } else {
        nextData.adminPin = await bcrypt.hash(text, 10);
        nextStep = 'BOT_PHONE';
        reply = `PIN secured! 🔐\n\nNow, tell me the *Phone Number* of the SIM card you put inside your bot phone.\n\n(e.g. 08012345678)`;
     }
  } else if (nextStep === 'BOT_PHONE') {
     const botPhone = text.replace(/\s+/g, '');
     if (botPhone.length < 10 || isNaN(parseInt(botPhone))) {
        reply = "Abeg enter a valid phone number (11 digits).";
     } else {
        reply = `Creating your Empire account for *${nextData.name}*... ⏳`;
        await tenantWhatsAppService.sendText(from, reply);

        try {
           // 1. Pre-check: validate phone is not already linked
           const normalizedBotPhone = parseAndFormatPhone(botPhone);
           if (normalizedBotPhone) {
               const rawPhone = normalizedBotPhone.replace('+', '');
               const jid = `${rawPhone}@s.whatsapp.net`;
               const existingOrg = await redisClient.get(`sidecar_map:${jid}`);
               if (existingOrg) {
                  reply = `⚠️ *Phone Already Registered:* The number ${botPhone} is already linked to another account. Please use a different SIM card.\n\nStart over by typing the referral link again.`;
                  await redisClient.del(prospectKey);
                  await tenantWhatsAppService.sendText(from, reply);
                  return { handled: true };
               }
           }

           // 2. Generate org ID (no DB writes yet)
           const newOrgId = `org_${crypto.randomBytes(4).toString('hex')}`;

           // 3. Request Pairing Code from Sidecar FIRST
           // If this fails, nothing is persisted — no orphan state.
           const sidecarUrl = process.env.WHATSAPP_SIDECAR_URL || 'http://localhost:8080';
           const apiKey = process.env.ADMIN_API_KEY;

           const response = await axios.post(
              `${sidecarUrl}/pair`,
              { orgId: newOrgId, phone: botPhone },
              {
                 headers: {
                    'X-API-Key': apiKey || '',
                    'Content-Type': 'application/json'
                 }
              }
           );

           const pairingCode = response.data.code;
           if (!pairingCode) throw new Error('Sidecar failed to generate pairing code.');

           // 4. Create Tenant (Firebase + PostgreSQL dual-write) — only on Sidecar success
           let firebaseWritten = false;
           try {
             await createTenant({
                id: newOrgId,
                name: nextData.name,
                whatsappPhoneId: 'PENDING',
                adminPhone: from,
                adminPin: nextData.adminPin,
                systemPrompt: `You are the AI Assistant for ${nextData.name}.`,
                timezone: 'Africa/Lagos'
             });
             firebaseWritten = true;

             await pgCreateTenant({
               id: newOrgId,
               name: nextData.name,
               whatsappPhoneId: 'PENDING',
               adminPhone: from,
               adminPin: nextData.adminPin,
               systemPrompt: `You are the AI Assistant for ${nextData.name}.`,
               timezone: 'Africa/Lagos'
             });
           } catch (dualWriteErr: any) {
             // Rollback: if Firebase was written but PostgreSQL failed, clean up Firebase
             if (firebaseWritten) {
               try {
                 await (await getDb()).collection('organizations').doc(newOrgId).delete();
                 logger.warn({ newOrgId, error: dualWriteErr.message }, '🔄 [ROLLBACK] Deleted Firebase tenant after PostgreSQL write failure');
               } catch (rollbackErr: any) {
                 logger.error({ newOrgId, error: rollbackErr.message }, '❌ [ROLLBACK] Failed to clean up Firebase tenant');
               }
             }
             throw dualWriteErr; // re-throw to outer catch for user-facing message
           }

           // 5. Set Redis Mapping (for Sidecar routing)
           if (normalizedBotPhone) {
               const rawPhone = normalizedBotPhone.replace('+', '');
               const jid = `${rawPhone}@s.whatsapp.net`;
               await redisClient.set(`sidecar_map:${jid}`, newOrgId);
               await redisClient.set(`sidecar_map:${rawPhone}`, newOrgId);
               logger.info({ orgId: newOrgId, jid }, '🔗 [AUTO-ONBOARDING] Hydrated sidecar mapping in Redis');
           }

           // 6. Update Tenant with Pending Setup (Firebase)
           await (await getDb()).collection('organizations').doc(newOrgId).update({
               status: 'AWAITING_SIDECAR',
               pendingSetup: {
                   botPhone,
                   pairingCode,
                   initiatedAt: new Date().toISOString()
               }
           });

           // 7. Cleanup Prospect State
           await redisClient.del(prospectKey);

           reply = `✅ *Account Created!* \n\n🔑 *YOUR PAIRING CODE:* ${pairingCode}\n\n👉 *To Activate:*\n1. Open WhatsApp on your *Bot Phone* (${botPhone}).\n2. Go to **Settings > Linked Devices**.\n3. Tap **Link a Device**.\n4. Tap **Link with phone number instead**.\n5. Enter the code above.\n\nOnce done, your Digital Apprentice will wake up! 🚀`;

        } catch (e: any) {
           logger.error({ error: e.message }, '❌ [PROSPECT FLOW] Sidecar Pairing Failed');
           if (e.response?.status === 409 || (e.message && e.message.includes('already'))) {
              reply = `⚠️ *Phone Already Registered:* The number ${botPhone} is already linked to WhatsApp. Please use a fresh SIM card that hasn't been used with WhatsApp Web before.\n\nStart over by typing the referral link again.`;
           } else {
              reply = `❌ *Setup Failed:* ${e.message}\n\nPlease check that the phone number is correct and has an active SIM card, then try again.`;
           }
        }
     }
  }

  if (reply && !reply.includes('Account Created')) {
     await redisClient.set(prospectKey, JSON.stringify({ step: nextStep, data: nextData }));
     await redisClient.expire(prospectKey, 3600); // 1 hour TTL
     await tenantWhatsAppService.sendText(from, reply);
  } else if (reply) {
     await tenantWhatsAppService.sendText(from, reply);
  }
  return { handled: true };
}

// ─── AUTO OTP RELAY ────────────────────────────────────────────────

async function handleOtpRelay(
  tenantWhatsAppService: WhatsAppService,
  from: string,
  text: string,
): Promise<{ handled: boolean }> {
  const isSixDigits = /^\d{6}$/.test(text);
  if (!isSixDigits) return { handled: false };

  const setups = await getPendingSetups();
  const target = setups.find(t => t.config?.adminPhone === from && t.status === 'AWAITING_OTP');
  
  if (target) {
      const setup = (target as any).pendingSetup;
      if (!setup || !setup.phoneId || !setup.accessToken) {
         await tenantWhatsAppService.sendText(from, `⚠️ Oga, I see your code *${text}*, but I no see your setup details. Please ask the Sovereign to restart the relay.`);
         return { handled: true };
      }

      logger.info({ orgId: target.id }, '🚀 [AUTO-IGNITION] Attempting Meta Registration');
      await tenantWhatsAppService.sendText(from, `Got it! Activating your bot *${target.name}* now... ⏳`);
      
      try {
         // 1. Create temporary service for registration
         const activationService = new WhatsAppService(setup.accessToken, setup.phoneId);
         
         // 2. Register with Meta
         await activationService.registerNumber(text);
         
         // 3. Subscribe WABA (Crucial for Webhooks)
         if (setup.wabaId) {
            await activationService.subscribeWaba(setup.wabaId);
         }

         // 4. Update Firestore and PostgreSQL status (dual-write with rollback)
         let fbActivated = false;
         try {
           await fbActivateTenant(target.id, setup.phoneId, setup.accessToken);
           fbActivated = true;
           await pgActivateTenant(target.id, setup.phoneId, setup.accessToken);
         } catch (dualWriteErr: any) {
           if (fbActivated) {
             try {
               await (await getDb()).collection('organizations').doc(target.id).update({
                 status: 'AWAITING_OTP',
                 config: { ...target.config, whatsappToken: '', phoneId: '' },
               });
               logger.warn({ orgId: target.id, error: dualWriteErr.message }, '🔄 [ROLLBACK] Reverted Firebase activation after PostgreSQL failure');
             } catch (rollbackErr: any) {
               logger.error({ orgId: target.id, error: rollbackErr.message }, '❌ [ROLLBACK] Failed to revert Firebase activation');
             }
           }
           throw dualWriteErr;
         }

         // 5. Cleanup pending data
         const docRef = (await getDb()).collection('organizations').doc(target.id);
         await docRef.update({ pendingSetup: null });

         logger.info({ orgId: target.id }, '✅ [AUTO-IGNITION] Success');
         
         if (process.env.MASTER_ADMIN_PHONE) {
            await tenantWhatsAppService.sendText(process.env.MASTER_ADMIN_PHONE, `⚡ *AUTO-IGNITION SUCCESS*\n\nBusiness: ${target.name}\nBoss: ${from}\nStatus: LIVE 🚀`);
         }

      } catch (err: any) {
         logger.error({ orgId: target.id, error: err.message }, '❌ [AUTO-IGNITION] Failed');
         await tenantWhatsAppService.sendText(from, `❌ *Activation Failed:* ${err.message}\n\nOga, please check if the code is correct or if it has expired.`);
         
         if (process.env.MASTER_ADMIN_PHONE) {
            await tenantWhatsAppService.sendText(process.env.MASTER_ADMIN_PHONE, `🚨 *AUTO-IGNITION FAILED*\n\nBusiness: ${target.name}\nError: ${err.message}`);
         }
      }
      return { handled: true };
  }

  // No matching pending setup found — pass through to normal AI handling
  return { handled: false };
}

// ─── BOSS SETUP FLOW (#setup state machine) ─────────────────────────

async function handleBossSetup(
  org: Organization,
  onboarding: OnboardingConfig | null,
  tenantWhatsAppService: WhatsAppService,
  redisClient: Redis,
  from: string,
  text: string,
  orgId: string,
): Promise<{ handled: boolean }> {
  const isAdmin = org.config?.adminPhone === from;
  if (!isAdmin) return { handled: false };

  // RESTART / CANCEL COMMANDS
  if (text === '#cancel' || text === '#reset') {
      await setOrgOnboarding(orgId, 'START', {});
      const resetMsg = text === '#reset' ? "💥 *Bot Reset Successful.* All setup data cleared. Type *#setup* to start fresh." : "🛑 *Setup Cancelled.*\n\nOga, I have cleared your temporary setup data. Type *#setup* when you are ready to start again.";
      await tenantWhatsAppService.sendText(from, resetMsg);
      return { handled: true };
  }

  // STATUS COMMAND
  if (text.toLowerCase() === '#status') {
      const balanceMajor = (org.balance || 0) / 100;

      const statusMsg = `📊 *BOT STATUS REPORT*\n\n` +
        `🤖 *Bot Name:* ${org.name}\n` +
        `🔋 *Service:* ${org.isActive ? '✅ ACTIVE' : '💤 MAINTENANCE'}\n` +
        `💳 *Balance:* ${formatCurrency(balanceMajor, org.currency?.locale || 'en-NG', org.currency?.code || 'NGN')}\n` +
        `🧠 *Model:* ${org.config?.model || SystemConfig.MODELS.ZYNUX_PRIMARY}\n\n` +
        `Oga, I am at your service!`;
      
      await tenantWhatsAppService.sendText(from, statusMsg);
      return { handled: true };
  }

  // 🛡️ [RE-SETUP PROTECTION]
  if (text === '#setup' && onboarding?.step === 'COMPLETE') {
      const warnMsg = `⚠️ *SETUP ALREADY COMPLETE*\n\nOga, your shop *${org.name}* is already fully set up. \n\nIf you really want to clear everything and START OVER, please type *#reset*. Otherwise, just tell me what you want to change!`;
      await tenantWhatsAppService.sendText(from, warnMsg);
      return { handled: true };
  }

  // STATE MACHINE
  const currentStep = onboarding?.step || (org.onboardingStep as OnboardingConfig['step']) || 'NONE';
  const currentData = onboarding?.data || (org.onboardingData as OnboardingData) || {};

  if (text !== '#setup' && currentStep === 'NONE' && currentStep === 'COMPLETE') return { handled: false };

  if (text === '#setup' || (currentStep !== 'COMPLETE' && currentStep !== 'NONE')) {
      logger.info({ orgId, step: currentStep || 'START' }, '🛠️ [ONBOARDING] Progressing step');
      
      let nextStep: OnboardingConfig['step'] = currentStep === 'NONE' ? 'START' : currentStep;
      let nextData: OnboardingData = { ...currentData };
      let reply = '';

      if (text === '#setup') {
          if (nextData.name) {
             nextStep = 'PIN';
             reply = `Welcome Oga! I see your shop name is *${nextData.name}*. \n\n*Step 2:* Set your *4-digit Admin PIN*.`;
          } else {
             nextStep = 'NAME';
             reply = `Oga! Welcome to Naija Agent. 🤝\n\nI am your new *Digital Apprentice*. Let's set up your shop so I can start making you money.\n\n*Step 1:* What is your *Business Name*?`;
          }
      } else if (text === '#back') {
          // 🔙 [UX]: History Traversal
          const backMap: Record<string, OnboardingConfig['step']> = {
             'PIN': 'NAME',
             'BANK_NAME': 'PIN',
             'BANK_ACCOUNT': 'BANK_NAME',
             'BANK_ACCOUNT_NAME': 'BANK_ACCOUNT',
             'TONE': 'BANK_ACCOUNT_NAME',
             'CUSTOM_TONE': 'TONE',
             'REVIEW': 'TONE',
             'BOT_PHONE': 'REVIEW'
          };

          // Clear data for the step being rolled back from so it must be re-entered
          const clearMap: Record<string, (keyof OnboardingData)[]> = {
             'PIN': ['adminPin'],
             'BANK_NAME': ['bankName'],
             'BANK_ACCOUNT': ['accountNumber'],
             'BANK_ACCOUNT_NAME': ['accountName'],
             'TONE': ['systemPrompt'],
             'CUSTOM_TONE': ['systemPrompt'],
             'REVIEW': [],
             'BOT_PHONE': ['botPhone'],
          };
          
          if (backMap[nextStep]) {
             const currentStepName = nextStep;
             nextStep = backMap[nextStep]!;

             // Clear data for the step we're leaving
             const fieldsToClear = clearMap[currentStepName];
             if (fieldsToClear) {
               for (const field of fieldsToClear) {
                 delete nextData[field];
               }
             }
             
             // Show the user what the previous step's value was (before we potentially cleared it)
             let prevVal = "Not set";
             if (currentStepName === 'PIN') prevVal = nextData.adminPin ? "[HASHED]" : "Not set";
             else if (currentStepName === 'BANK_NAME') prevVal = nextData.bankName || "Not set";
             else if (currentStepName === 'BANK_ACCOUNT') prevVal = nextData.accountNumber || "Not set";
             else if (currentStepName === 'BANK_ACCOUNT_NAME') prevVal = nextData.accountName || "Not set";
             else if (currentStepName === 'TONE') prevVal = "Tone Selection";
             // Note: REVIEW clearMap is empty, so the values above are still accurate

             reply = `⏪ *Back to previous step.*\n\n(Current Data for this step: ${prevVal})\n\nPlease enter the value again or type the new one.`;
          } else {
             reply = "Oga, we are at the start. You fit only go forward from here!";
          }
      } else if (nextStep === 'NAME') {
          if (!nextData.name) nextData.name = text;
          
          if (nextData.adminPin) {
             nextStep = 'BANK_NAME';
             reply = `Got it: *${nextData.name}*. \n(PIN already secured 🔐)\n\n*Step 3:* What is your *Bank Name*?`;
          } else {
             nextStep = 'PIN';
             reply = `Got it: *${nextData.name}*.\n\n*Step 2:* Set your *4-digit Admin PIN*. (e.g. 1234)`;
          }
      } else if (nextStep === 'PIN') {
          if (text.length !== 4 || isNaN(parseInt(text))) {
              reply = "Abeg, use exactly 4 numbers for your PIN.";
              await updateAndReply(orgId, nextStep, nextData, tenantWhatsAppService, from, reply);
              return { handled: true };
          }
          nextData.adminPin = await bcrypt.hash(text, 10);

          if (nextData.bankName) {
             nextStep = 'BANK_ACCOUNT';
             reply = "PIN secured! 🔐\n(I also see your Bank Name is " + nextData.bankName + ")\n\nWhat is your *Account Number*? (10 digits)";
          } else {
             nextStep = 'BANK_NAME';
             reply = "PIN secured! 🔐\n\n*Step 3:* Now, your *Bank Details* for customers to pay you.\n\nWhat is your *Bank Name*? (e.g. GTBank, OPay, Zenith)";
          }
      } else if (nextStep === 'BANK_NAME') {
          if (!nextData.bankName) nextData.bankName = text;
          
          if (nextData.accountNumber) {
             nextStep = 'BANK_ACCOUNT_NAME';
             reply = `Okay, *${nextData.bankName}*. \n(Account: ${nextData.accountNumber})\n\nAnd the *Account Name*?`;
          } else {
             nextStep = 'BANK_ACCOUNT';
             reply = `Okay, *${nextData.bankName}*.\n\nWhat is your *Account Number*? (Exactly 10 digits)`;
          }
      } else if (nextStep === 'BANK_ACCOUNT') {
          // --- DYNAMIC BANK VALIDATION ---
          const isValidNuban = /^\d{10}$/.test(text);
          const isValidIban = /^[a-zA-Z0-9]{6,34}$/.test(text);
          const activeCurrency = org.currency || { code: 'NGN' };

          if (activeCurrency.code === 'NGN') {
              if (text.length !== 10 || isNaN(parseInt(text))) {
                  reply = "Account number must be 10 digits (NUBAN).";
                  await updateAndReply(orgId, nextStep, nextData, tenantWhatsAppService, from, reply);
                  return { handled: true };
              }
              nextData.accountNumber = text;
          } else {
              // International
              if (!isValidIban) {
                 reply = "Please enter a valid Account/IBAN number (6-34 characters).";
                 await updateAndReply(orgId, nextStep, nextData, tenantWhatsAppService, from, reply);
                 return { handled: true };
              }
              nextData.accountNumber = text;
          }

          if (nextData.accountName) {
             nextStep = 'TONE';
             reply = "Bank details set! 💰\n\n*Step 4 (Final):* How should I talk to your customers?\n\n1. *Professional* (Official & Polite)\n2. *Street-Smart* (Mix of English & Pidgin)\n\nType 1 or 2.";
          } else {
             nextStep = 'BANK_ACCOUNT_NAME';
             reply = "And the *Account Name*? (e.g. Bims Gadgets Ltd)";
          }
      } else if (nextStep === 'BANK_ACCOUNT_NAME') {
          if (!nextData.accountName) nextData.accountName = text;
          nextStep = 'TONE';
          reply = "Bank details set! 💰\n\n*Step 4 (Final):* How should I talk to your customers?\n\n1. *Professional* (Official & Polite)\n2. *Street-Smart* (Mix of English & Pidgin)\n3. *Custom* (You tell me!)\n\nType 1, 2, or 3.";
      } else if (nextStep === 'TONE') {
          if (['1', '2', '3'].includes(text)) {
              if (text === '3') {
                  nextStep = 'CUSTOM_TONE';
                  reply = "Okay! Describe how you want me to talk. \n\n*Example:* 'You are a calm, luxury assistant for a jewelry brand. Speak elegantly.'";
              } else {
                  const tone = text === '1' ? 'Professional' : 'Street-Smart';
                  const prompt = tone === 'Professional' 
                    ? ONBOARDING_PROMPTS.PROFESSIONAL(nextData.name || 'Business')
                    : ONBOARDING_PROMPTS.STREET_SMART(nextData.name || 'Business');
                  
                  nextData.systemPrompt = prompt;
                  nextStep = 'REVIEW';
                  reply = `📝 *REVIEW YOUR DETAILS*\n\nName: ${nextData.name}\nBank: ${nextData.bankName}\nAccount: ${nextData.accountNumber}\nName: ${nextData.accountName}\nTone: ${tone}\n\n*Type YES to finish, or BACK to edit.*`;
              }
          } else {
              reply = "Please type *1*, *2*, or *3*.";
          }
      } else if (nextStep === 'CUSTOM_TONE') {
          nextData.systemPrompt = `You are the AI Assistant for ${nextData.name}. ${text}`;
          nextStep = 'REVIEW';
          reply = `📝 *REVIEW YOUR DETAILS*\n\nName: ${nextData.name}\nBank: ${nextData.bankName}\nAccount: ${nextData.accountNumber}\nName: ${nextData.accountName}\nTone: Custom\n\n*Type YES to finish, or BACK to edit.*`;
      } else if (nextStep === 'REVIEW') {
          if (text.toUpperCase() === 'YES') {
              // INSTEAD OF COMPLETING, WE ASK FOR PHONE
              nextStep = 'BOT_PHONE';
              reply = `✅ Details Confirmed!\n\n*One Final Step to go LIVE:*\n\nWhat is the **Phone Number** of the SIM card you put in the bot phone?\n\n(e.g. 08012345678)`;
          } else {
              reply = "Okay. Type *#back* to edit the last step, or *#reset* to start over.";
          }
      } else if (nextStep === 'BOT_PHONE') {
          // --- SOVEREIGN AUTO-IGNITION (SIDECAR) ---
          const botPhone = text.replace(/\s+/g, '');
          if (botPhone.length < 10) {
             reply = "Abeg enter a valid phone number.";
             await updateAndReply(orgId, nextStep, nextData, tenantWhatsAppService, from, reply);
             return { handled: true };
          }

          reply = `Generating Pairing Code for *${botPhone}*... ⏳`;
          await tenantWhatsAppService.sendText(from, reply);

          try {
             // 1. Pre-check: validate phone is not already linked
             const normalizedBotPhone = parseAndFormatPhone(botPhone) || '';
             if (normalizedBotPhone) {
                 const rawPhone = normalizedBotPhone.replace('+', '');
                 const jid = `${rawPhone}@s.whatsapp.net`;
                 const existingOrg = await redisClient.get(`sidecar_map:${jid}`);
                 if (existingOrg && existingOrg !== orgId) {
                    reply = `⚠️ *Phone Already Registered:* The number ${botPhone} is already linked to another account. Please use a different SIM card.\n\nType *#reset* to start over.`;
                    await tenantWhatsAppService.sendText(from, reply);
                    return { handled: true };
                 }
             }

             // 2. Request Pairing Code from Sidecar FIRST
             // (If this fails, nothing was persisted — no cleanup needed)
             const sidecarUrl = process.env.WHATSAPP_SIDECAR_URL || 'http://localhost:8080';
             const apiKey = process.env.ADMIN_API_KEY;

             const response = await axios.post(
                `${sidecarUrl}/pair`,
                { orgId, phone: botPhone },
                {
                   headers: {
                      'X-API-Key': apiKey || '',
                      'Content-Type': 'application/json'
                   }
                }
             );

             const pairingCode = response.data.code;
             if (!pairingCode) throw new Error('Sidecar failed to generate pairing code.');

             // 3. Save Preliminary Data (Firebase + PostgreSQL) — only on Sidecar success
             let fbCompleted = false;
             try {
               await completeOnboarding(orgId, { ...nextData, botPhone: botPhone });
               fbCompleted = true;
               await pgCompleteOnboarding(orgId, { ...nextData, adminPin: nextData.adminPin!, botPhone: botPhone });
             } catch (dualWriteErr: any) {
               if (fbCompleted) {
                 try {
                   await setOrgOnboarding(orgId, 'BOT_PHONE', nextData);
                   logger.warn({ orgId, error: dualWriteErr.message }, '🔄 [ROLLBACK] Reverted Firebase onboarding after PostgreSQL failure');
                 } catch (rollbackErr: any) {
                   logger.error({ orgId, error: rollbackErr.message }, '❌ [ROLLBACK] Failed to revert Firebase onboarding');
                 }
               }
               throw dualWriteErr;
             }

             // 4. Set Redis Mapping (for Sidecar routing)
             if (normalizedBotPhone) {
                 const rawPhone = normalizedBotPhone.replace('+', '');
                 const jid = `${rawPhone}@s.whatsapp.net`;
                 await redisClient.set(`sidecar_map:${jid}`, orgId);
                 await redisClient.set(`sidecar_map:${rawPhone}`, orgId);
                 logger.info({ orgId, jid }, '🔗 [AUTO-ONBOARDING] Hydrated sidecar mapping in Redis');
             }

             // 4b. Check for Referral
             try {
                const { createReferral } = await import('@naija-agent/database');
                const referrerPhone = await redisClient.get(`referral:${from}`);
                if (referrerPhone) {
                    await createReferral(referrerPhone, orgId);
                    logger.info({ orgId, referrerPhone }, '🤝 [REFERRAL] Referral logged for new tenant');
                }
             } catch (refErr: any) {
                logger.error({ orgId, error: refErr.message }, '⚠️ [REFERRAL] Failed to log referral');
             }

             // 5. Update Org with Pending Setup
             await (await getDb()).collection('organizations').doc(orgId).update({
                 whatsappPhoneId: 'PENDING',
                 status: 'AWAITING_SIDECAR',
                 pendingSetup: {
                     botPhone,
                     pairingCode,
                     initiatedAt: new Date().toISOString()
                 }
             });

             nextStep = 'OTP_WAIT';

             // Set onboarding state so the step is saved
             await Promise.all([
               setOrgOnboarding(orgId, 'OTP_WAIT', { ...nextData, botPhone: botPhone }),
               pgSetOrgOnboarding(orgId, 'OTP_WAIT', { ...nextData, adminPin: nextData.adminPin!, botPhone: botPhone })
             ]);

             reply = `✅ *Pairing Code Generated!* \n\n🔑 *CODE:* ${pairingCode}\n\n👉 *To Activate:*\n1. Open WhatsApp on your *Bot Phone*.\n2. Go to **Settings > Linked Devices**.\n3. Tap **Link a Device**.\n4. Tap **Link with phone number instead**.\n5. Enter the code above.\n\nOnce linked, your Digital Apprentice will be ready! 🚀`;

          } catch (e: any) {
             logger.error({ orgId, error: e.message }, '❌ [AUTO-ONBOARDING] Sidecar Pairing Failed');
             if (e.response?.status === 409 || (e.message && e.message.includes('already'))) {
                reply = `⚠️ *Phone Already Linked:* The number ${botPhone} is already linked to WhatsApp. Please use a fresh SIM card.\n\nType *#reset* to start over.`;
             } else {
                reply = `❌ *Setup Failed:* ${e.message}\n\nPlease check if the SIM is active and try again.`;
             }
          }
      } else if (nextStep === 'OTP_WAIT') {
          reply = "Your bot is linking... ⏳\n\nPlease wait a few seconds, then type *#status* to see if I am LIVE! 🚀";
          await updateAndReply(orgId, nextStep, nextData, tenantWhatsAppService, from, reply);
          return { handled: true };
      }

      if (reply) {
          await Promise.all([
            setOrgOnboarding(orgId, nextStep, nextData),
            pgSetOrgOnboarding(orgId, nextStep, nextData)
          ]);
          await tenantWhatsAppService.sendText(from, reply);
          return { handled: true };
      }
  }

  return { handled: false };
}

// ─── Helper: save onboarding state and send reply ───────────────────

async function updateAndReply(
  orgId: string,
  step: OnboardingConfig['step'],
  data: OnboardingData,
  whatsAppService: WhatsAppService,
  to: string,
  reply: string,
): Promise<void> {
  await Promise.all([
    setOrgOnboarding(orgId, step, data),
    pgSetOrgOnboarding(orgId, step, data)
  ]);
  await whatsAppService.sendText(to, reply);
}

// ─── ENTRY POINT ────────────────────────────────────────────────────

export async function handleOnboarding(
  job: Job<JobData>,
  org: Organization,
  onboarding: OnboardingConfig | null,
  tenantWhatsAppService: WhatsAppService,
  redisClient: Redis
): Promise<{ success: boolean } | null> {
  const { from, orgId, content, type } = job.data;
  const text = type === 'text' ? (content.text || '').trim() : '';
  const isAdmin = org.config?.adminPhone === from;

  // 1. PROSPECT FLOW — non-admin users messaging Master Bot
  if (org.config?.isMaster && !isAdmin) {
    const { handled } = await handleProspectFlow(redisClient, tenantWhatsAppService, from, text, org);
    if (handled) return { success: true };
  }

  // 2. AUTO OTP RELAY — 6-digit code received by Master Bot
  if (org.config?.isMaster) {
    const { handled } = await handleOtpRelay(tenantWhatsAppService, from, text);
    if (handled) return { success: true };
  }

  // 3. BOSS SETUP FLOW — #setup state machine
  const { handled } = await handleBossSetup(org, onboarding, tenantWhatsAppService, redisClient, from, text, orgId);
  if (handled) return { success: true };

  return null; // Not an onboarding command
}
