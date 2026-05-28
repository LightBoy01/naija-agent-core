import { Job } from 'bullmq';
import { JobData, OnboardingConfig, OnboardingData, SystemConfig, ONBOARDING_PROMPTS } from '@naija-agent/types';
import { WhatsAppService } from '../services/whatsapp.js';
import { GoogleGenAI } from '@google/genai';
import { 
  getOrgById, 
  setOrgOnboarding, 
  completeOnboarding, 
  getPendingSetups,
  createTenant,
  Organization
} from '@naija-agent/firebase';
import { Redis } from 'ioredis';
import { formatCurrency } from '../utils/currency.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

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
  const currency = org.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };

  // 1. SOVEREIGN LEAD CAPTURE (PROSPECT FLOW)
  // Logic for users messaging the Master Bot to start a new business
  if (org.config?.isMaster && !isAdmin) {
      const prospectKey = `prospect:${from}`;
      const rawState = await redisClient.get(prospectKey);
      let state = rawState ? JSON.parse(rawState) : null;
      
      const isReferral = text.includes('I_want_AI_for_my_business_');

      if (isReferral || state) {
          logger.info({ from, state }, '🛠️ [PROSPECT FLOW] Processing step');
          
          let nextStep = state?.step || 'START';
          let nextData = state?.data || {};
          let reply = "";

          if (isReferral) {
             nextStep = 'NAME';
             reply = `Oga Boss! Welcome to the Naija Agent Empire! 🚀\n\nI see say you wan get your own Digital Apprentice to help you sell more.\n\nTo start, wetin be the *Name of your Business*? (e.g. Bims Gadgets)`;
          } else if (text.toLowerCase() === '#cancel') {
             await redisClient.del(prospectKey);
             await tenantWhatsAppService.sendText(from, "🛑 Signup cancelled. Message me anytime to start again!");
             return { success: true };
          } else if (nextStep === 'NAME') {
             if (text.length < 3) {
                reply = "Abeg, type a proper business name.";
             } else {
                nextData.name = text;
                nextStep = 'BOT_PHONE';
                reply = `Nice name! *${nextData.name}* is going to be big! 🌟\n\nNow, tell me the *Phone Number* of the SIM card you put inside your bot phone.\n\n(e.g. 08012345678)`;
             }
          } else if (nextStep === 'BOT_PHONE') {
             const botPhone = text.replace(/\s+/g, '');
             if (botPhone.length < 10 || isNaN(parseInt(botPhone))) {
                reply = "Abeg enter a valid phone number (11 digits).";
             } else {
                // --- CREATE TENANT & TRIGGER META ---
                reply = `Creating your Empire account for *${nextData.name}*... ⏳`;
                await tenantWhatsAppService.sendText(from, reply);

                try {
                   // 1. Create Tenant Document
                   const newOrgId = `org_${crypto.randomBytes(4).toString('hex')}`;
                   await createTenant({
                      id: newOrgId,
                      name: nextData.name,
                      whatsappPhoneId: 'PENDING',
                      adminPhone: from,
                      adminPin: '0000', // Default hash placeholder for setup
                      systemPrompt: `You are the AI Assistant for ${nextData.name}.`,
                      timezone: 'Africa/Lagos'
                   });

                   // 2. Trigger Meta (Master Token)
                   const wabaId = process.env.WHATSAPP_WABA_ID;
                   const masterToken = process.env.WHATSAPP_API_TOKEN;
                   
                   if (!wabaId || !masterToken) throw new Error('System Config Error: Missing WABA ID/Token');
                   
                   const sovereignService = new WhatsAppService(masterToken, '');
                   const { phoneId } = await sovereignService.addPhoneNumber(wabaId, botPhone, nextData.name);

                   // 3. Update Tenant with Pending Setup
                   const { getDb } = await import('@naija-agent/firebase');
                   await (await getDb()).collection('organizations').doc(newOrgId).update({
                       status: 'AWAITING_OTP',
                       pendingSetup: {
                           phoneId,
                           accessToken: masterToken,
                           wabaId,
                           initiatedAt: new Date().toISOString()
                       }
                   });

                   // 4. Trigger OTP SMS
                   const activationService = new WhatsAppService(masterToken, phoneId);
                   await activationService.requestCode('SMS');

                   // 5. Cleanup Prospect State
                   await redisClient.del(prospectKey);

                   reply = `✅ *Account Created!* \n\nI have asked Meta to send a *6-digit SMS code* to ${botPhone}.\n\n👉 *Type the code here immediately to activate your bot!*`;

                } catch (e: any) {
                   logger.error({ error: e.message }, '❌ [PROSPECT FLOW] Failed');
                   reply = `❌ *Setup Failed:* ${e.message}\n\nPlease check the number and try again.`;
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
          return { success: true };
      }
  }

  // 2. AUTOMATIC OTP RELAY (Master Context - Triggered by Boss sending code to Master)
  const isSixDigits = /^\d{6}$/.test(text);
  if (org.config?.isMaster && isSixDigits) {
      const setups = await getPendingSetups();
      const target = setups.find(t => t.config?.adminPhone === from && t.status === 'AWAITING_OTP');
      
      if (target) {
          const setup = (target as any).pendingSetup;
          if (!setup || !setup.phoneId || !setup.accessToken) {
             await tenantWhatsAppService.sendText(from, `⚠️ Oga, I see your code *${text}*, but I no see your setup details. Please ask the Sovereign to restart the relay.`);
             return { success: true };
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

             // 4. Update Firestore status
             const { activateTenant: activate } = await import('@naija-agent/firebase');
             await activate(target.id, setup.phoneId, setup.accessToken);

             // 5. Cleanup pending data
             const { getDb } = await import('@naija-agent/firebase');
             await (await getDb()).collection('organizations').doc(target.id).update({ 
                pendingSetup: null 
             });

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
          return { success: true };
      }
  }

  if (!isAdmin) return null; // Only Boss handles the rest of setup

  // 3. RESTART / CANCEL COMMANDS
  if (text === '#cancel' || text === '#reset') {
      await setOrgOnboarding(orgId, 'START', {});
      const resetMsg = text === '#reset' ? "💥 *Bot Reset Successful.* All setup data cleared. Type *#setup* to start fresh." : "🛑 *Setup Cancelled.*\n\nOga, I have cleared your temporary setup data. Type *#setup* when you are ready to start again.";
      await tenantWhatsAppService.sendText(from, resetMsg);
      return { success: true };
  }

  // 4. STATUS COMMAND
  if (text.toLowerCase() === '#status') {
      const heartbeatKey = `bridge_heartbeat:${orgId}`;
      const lastHeartbeat = await redisClient.get(heartbeatKey);
      const balanceMajor = (org.balance || 0) / 100;
      
      let bridgeStatus = "❌ OFFLINE";
      if (lastHeartbeat) {
          const diffMinutes = (Date.now() - parseInt(lastHeartbeat)) / (1000 * 60);
          if (diffMinutes <= 15) bridgeStatus = "✅ ONLINE";
          else bridgeStatus = `⚠️ LAGGING (${Math.floor(diffMinutes)}m ago)`;
      }

      const statusMsg = `📊 *BOT STATUS REPORT*\n\n` +
        `🤖 *Bot Name:* ${org.name}\n` +
        `🔋 *Service:* ${org.isActive ? '✅ ACTIVE' : '💤 MAINTENANCE'}\n` +
        `💳 *Balance:* ${formatCurrency(balanceMajor, currency.locale, currency.code)}\n` +
        `📲 *SMS Bridge:* ${bridgeStatus}\n` +
        `🧠 *Model:* ${org.config?.model || 'gemma-4-26b-a4b-it'}\n\n` +
        `Oga, I am at your service!`;
      
      await tenantWhatsAppService.sendText(from, statusMsg);
      return { success: true };
  }

  // 🛡️ [RE-SETUP PROTECTION]
  if (text === '#setup' && onboarding?.step === 'COMPLETE') {
      const warnMsg = `⚠️ *SETUP ALREADY COMPLETE*\n\nOga, your shop *${org.name}* is already fully set up. \n\nIf you really want to clear everything and START OVER, please type *#reset*. Otherwise, just tell me what you want to change!`;
      await tenantWhatsAppService.sendText(from, warnMsg);
      return { success: true };
  }

  // 5. ONBOARDING STATE MACHINE
  const currentStep = onboarding?.step || (org.onboardingStep as OnboardingConfig['step']) || 'NONE';
  const currentData = onboarding?.data || (org.onboardingData as OnboardingData) || {};

  if (text === '#setup' || (currentStep !== 'COMPLETE' && currentStep !== 'NONE')) {
      logger.info({ orgId, step: currentStep || 'START' }, '🛠️ [ONBOARDING] Progressing step');
      
      let nextStep: OnboardingConfig['step'] = currentStep === 'NONE' ? 'START' : currentStep;
      let nextData: OnboardingData = { ...currentData };
      let reply = "";

      // --- PHASE 7.4: GREEDY SEMANTIC EXTRACTION ---
      if ((text === '#setup' || nextStep === 'NAME' || nextStep === 'START') && text.length > 10) {
         try {
            const genAI = new GoogleGenAI({
               apiKey: process.env.GEMINI_API_KEY || '',
               httpOptions: {
                  baseUrl: 'https://aiplatform.googleapis.com',
                  apiVersion: 'v1/publishers/google'
               }
            });
            
            const extractionPrompt = `${ONBOARDING_PROMPTS.GREEDY_EXTRACTION}: "${text}"`;
            
            const result = await genAI.models.generateContent({
               model: SystemConfig.MODELS.ZYNUX_FALLBACK,
               contents: extractionPrompt
            });
            const extracted = JSON.parse((result.text || "").replace(/```json|```/g, '').trim());
            
            logger.info({ orgId, extracted }, '🧠 [GREEDY EXTRACTION] AI Extraction Result');

            // --- LOCALE-AWARE VALIDATION ---
            const currency = org.currency || { code: 'NGN' };
            
            if (extracted.businessName) nextData.name = extracted.businessName;
            if (extracted.adminPin && /^\d{4}$/.test(extracted.adminPin.trim())) {
                const bcrypt = await import('bcrypt');
                nextData.adminPin = await bcrypt.hash(extracted.adminPin.trim(), 10);
            }
            if (extracted.bankName) nextData.bankName = extracted.bankName;

            // Bank Account Validation (Dynamic)
            if (extracted.accountNumber) {
               if (currency.code === 'NGN') {
                  // NUBAN: Strictly 10 digits
                  if (/^\d{10}$/.test(extracted.accountNumber)) nextData.accountNumber = extracted.accountNumber;
               } else {
                  // IBAN/SWIFT/ACH: 6 to 34 chars (alphanumeric)
                  if (/^[a-zA-Z0-9]{6,34}$/.test(extracted.accountNumber)) nextData.accountNumber = extracted.accountNumber;
               }
            }
            
            if (extracted.accountName) nextData.accountName = extracted.accountName;

         } catch (e) {
            logger.warn({ orgId, error: e }, '⚠️ [EXTRACTION FAILED]');
         }
      }

      if (text === '#setup') {
          // If we managed to extract the name already (e.g. "#setup My Shop is Bims"), jump ahead
          if (nextData.name) {
             nextStep = 'PIN';
             reply = `Welcome Oga! I see your shop name is *${nextData.name}*. \n\n*Step 2:* Set your *4-digit Admin PIN*.`;
          } else {
             nextStep = 'NAME';
             reply = `Oga! Welcome to Naija Agent. 🤝\n\nI am your new *Digital Apprentice*. Let's set up your shop so I can start making you money.\n\n*Step 1:* What is your *Business Name*?`;
          }
      } else if (text === '#back') {
          // 🔙 [UX]: History Traversal (Simple Map)
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
          
          if (backMap[nextStep]) {
             const prevStep = backMap[nextStep] as string;
             nextStep = backMap[nextStep]!;
             
             // Dynamic lookup for the previous value to show the user
             let prevVal = "Not set";
             if (prevStep === 'NAME') prevVal = nextData.name || "Not set";
             else if (prevStep === 'PIN') prevVal = nextData.adminPin ? "[HASHED]" : "Not set";
             else if (prevStep === 'BANK_NAME') prevVal = nextData.bankName || "Not set";
             else if (prevStep === 'BANK_ACCOUNT') prevVal = nextData.accountNumber || "Not set";
             else if (prevStep === 'BANK_ACCOUNT_NAME') prevVal = nextData.accountName || "Not set";
             else if (prevStep === 'TONE') prevVal = "Tone Selection";

             reply = `⏪ *Back to previous step.*\n\n(Current Data for this step: ${prevVal})\n\nPlease enter the value again or type the new one.`;
          } else {
             reply = "Oga, we are at the start. You fit only go forward from here!";
          }
      } else if (nextStep === 'NAME') {
          if (!nextData.name) nextData.name = text; // Only set if not already extracted
          
          if (nextData.adminPin) {
             nextStep = 'BANK_NAME';
             reply = `Got it: *${nextData.name}*. \n(PIN already secured 🔐)\n\n*Step 3:* What is your *Bank Name*?`;
          } else {
             nextStep = 'PIN';
             reply = `Got it: *${nextData.name}*.\n\n*Step 2:* Set your *4-digit Admin PIN*. (e.g. 1234)`;
          }
      } else if (nextStep === 'PIN') {
          if (nextData.adminPin && text.length > 4) { 
             // User sent a long sentence, maybe bank details? Assume PIN was set by Greedy.
          } else if (text.length !== 4 || isNaN(parseInt(text))) {
              reply = "Abeg, use exactly 4 numbers for your PIN.";
              return { success: true };
          } else {
              const bcrypt = await import('bcrypt');
              nextData.adminPin = await bcrypt.hash(text, 10);
          }

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
          const currency = org.currency || { code: 'NGN' };

          if (currency.code === 'NGN') {
              if (text.length !== 10 || isNaN(parseInt(text))) {
                  reply = "Account number must be 10 digits (NUBAN).";
                  return { success: true };
              }
              nextData.accountNumber = text;
          } else {
              // International
              if (!isValidIban) {
                 reply = "Please enter a valid Account/IBAN number (6-34 characters).";
                 return { success: true };
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
          // --- SOVEREIGN AUTO-IGNITION ---
          const botPhone = text.replace(/\s+/g, '');
          // Basic validation
          if (botPhone.length < 10) {
             reply = "Abeg enter a valid phone number.";
             return { success: true };
          }

          reply = `Generated WABA Request for *${botPhone}*... ⏳`;
          await tenantWhatsAppService.sendText(from, reply);

          try {
             // 1. Save Preliminary Data (So we have a record even if Meta fails)
             await completeOnboarding(orgId, { ...nextData, botPhone: botPhone }); // Save Name, Bank, etc.
             
             // 2. Trigger Meta (Using Sovereign/Master Token)
             const wabaId = process.env.WHATSAPP_WABA_ID; 
             const masterToken = process.env.WHATSAPP_API_TOKEN;
             if (!wabaId) throw new Error('System Error: Sovereign WABA ID missing.');
             if (!masterToken) throw new Error('System Error: Sovereign API Token missing.');

             const sovereignService = new WhatsAppService(masterToken, ''); 
             const { phoneId } = await sovereignService.addPhoneNumber(wabaId, botPhone, nextData.name || 'New Business');
             
             // 3. Update Org with Pending Setup
             const { getDb } = await import('@naija-agent/firebase');
             await (await getDb()).collection('organizations').doc(orgId).update({
                 whatsappPhoneId: 'PENDING', // Mark as pending
                 status: 'AWAITING_OTP',
                 pendingSetup: {
                     phoneId,
                     accessToken: masterToken,
                     wabaId,
                     initiatedAt: new Date().toISOString()
                 }
             });

             // 4. Trigger OTP
             const activationService = new WhatsAppService(masterToken, phoneId);
             await activationService.requestCode('SMS');

             nextStep = 'OTP_WAIT';
             reply = `✅ *Meta Accepted!* \n\nI have asked them to send a *6-digit SMS code* to ${botPhone}.\n\n👉 *Type the code here immediately!*`;

          } catch (e: any) {
             logger.error({ orgId, error: e.message }, '❌ [AUTO-ONBOARDING] Failed');
             reply = `❌ *Setup Failed:* ${e.message}\n\nPlease check if the SIM is active and try again (Type the number again).`;
             // Stay on BOT_PHONE step to retry
          }
      } else if (nextStep === 'OTP_WAIT') {
          // --- TENANT OTP ACTIVATION ---
          // This allows the TENANT (using their own phone, which is also the Admin Phone) to verify
          if (/^\d{6}$/.test(text)) {
             const { getDb, activateTenant } = await import('@naija-agent/firebase');
             const orgDoc = await (await getDb()).collection('organizations').doc(orgId).get();
             const orgData = orgDoc.data();
             const setup = orgData?.pendingSetup;

             if (setup && setup.phoneId && setup.accessToken) {
                logger.info({ orgId }, '🚀 [TENANT-IGNITION] Attempting Meta Registration');
                await tenantWhatsAppService.sendText(from, `Verifying code *${text}*... ⏳`);

                try {
                   const activationService = new WhatsAppService(setup.accessToken, setup.phoneId);
                   
                   // 1. Register with Meta
                   await activationService.registerNumber(text);
                   
                   // 2. Subscribe WABA
                   if (setup.wabaId) {
                      await activationService.subscribeWaba(setup.wabaId);
                   }

                   // 3. Activate
                   await activateTenant(orgId, setup.phoneId, setup.accessToken);

                   // 4. Cleanup
                   await (await getDb()).collection('organizations').doc(orgId).update({ 
                      pendingSetup: null,
                      onboardingStep: 'COMPLETE'
                   });

                   logger.info({ orgId }, '✅ [TENANT-IGNITION] Success');
                   
                   reply = `⚡ *ACTIVATION SUCCESSFUL!* 🚀\n\nYour bot is now LIVE! \n\nCustomers can message this number to start buying.\n\nType *#status* to check your health.`;
                   nextStep = 'COMPLETE';

                   if (process.env.MASTER_ADMIN_PHONE) {
                      const masterToken = process.env.WHATSAPP_API_TOKEN;
                      const masterPhoneId = process.env.WHATSAPP_PHONE_ID;
                      if (masterToken && masterPhoneId) {
                         const masterService = new WhatsAppService(masterToken, masterPhoneId);
                         await masterService.sendText(process.env.MASTER_ADMIN_PHONE, `⚡ *AUTO-IGNITION SUCCESS (Self-Verify)*\n\nBusiness: ${org.name}\nBoss: ${from}\nStatus: LIVE 🚀`);
                      }
                   }

                } catch (err: any) {
                   logger.error({ orgId, error: err.message }, '❌ [TENANT-IGNITION] Failed');
                   reply = `❌ *Verification Failed:* ${err.message}\n\nPlease check if the code is correct.`;
                }
             } else {
                reply = "⚠️ System Error: Setup details lost. Please type *#reset* to start over.";
             }
          } else {
             reply = "Waiting for 6-digit code... (Check the Bot SIM)";
          }
      }

      if (reply) {
          await setOrgOnboarding(orgId, nextStep, nextData);
          await tenantWhatsAppService.sendText(from, reply);
          return { success: true };
      }
  }

  return null; // Not an onboarding command
}
