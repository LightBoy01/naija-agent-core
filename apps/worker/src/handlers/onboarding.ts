import { Job } from 'bullmq';
import { JobData, OnboardingConfig, OnboardingData, SystemConfig } from '@naija-agent/types';
import { WhatsAppService } from '../services/whatsapp.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  getOrgById, 
  setOrgOnboarding, 
  completeOnboarding, 
  getPendingSetups,
  Organization
} from '@naija-agent/firebase';
import { Redis } from 'ioredis';
import { formatCurrency } from '../utils/currency.js';

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

  // 1. SOVEREIGN LEAD CAPTURE
  const isReferral = text.includes('I_want_AI_for_my_business_');
  if (org.config?.isMaster && isReferral) {
      const referralMsg = `Oga Boss! I see say you wan get your own Digital Apprentice to help you sell more! 🚀\n\nI ready to help you set am up sharp-sharp (e no go take more than 5 minutes).\n\nTo start, wetin be the *Name of your Business*? (e.g. Bims Gadgets)`;
      await tenantWhatsAppService.sendText(from, referralMsg);
      return { success: true };
  }

  // 2. AUTOMATIC OTP RELAY (Auto-Ignition Phase 7.8)
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

          console.log(`🚀 [AUTO-IGNITION] Attempting Meta Registration for: ${target.id}`);
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

             console.log(`✅ [AUTO-IGNITION] Success for ${target.id}`);
             
             if (process.env.MASTER_ADMIN_PHONE) {
                await tenantWhatsAppService.sendText(process.env.MASTER_ADMIN_PHONE, `⚡ *AUTO-IGNITION SUCCESS*\n\nBusiness: ${target.name}\nBoss: ${from}\nStatus: LIVE 🚀`);
             }

          } catch (err: any) {
             console.error(`❌ [AUTO-IGNITION] Failed for ${target.id}:`, err.message);
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
        `🧠 *Model:* ${org.config?.model || 'gemini-3.1-flash-lite-preview'}\n\n` +
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
  if (text === '#setup' || (onboarding && onboarding.step !== 'COMPLETE' && onboarding.step !== 'NONE')) {
      console.log(`🛠️ [ONBOARDING] Boss of ${orgId} is in step: ${onboarding?.step || 'START'}`);
      
      let nextStep: OnboardingConfig['step'] = onboarding?.step || 'START';
      let nextData: OnboardingData = onboarding?.data || {};
      let reply = "";

      // --- PHASE 7.4: GREEDY SEMANTIC EXTRACTION ---
      if ((text === '#setup' || nextStep === 'NAME' || nextStep === 'START') && text.length > 10) {
         try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
            const model = genAI.getGenerativeModel({ model: SystemConfig.MODELS.FALLBACK_L2 }); // Flash-Lite for speed
            
            const extractionPrompt = `
            Extract onboarding data from this user message: "${text}"
            
            Return JSON ONLY with these fields (use null if missing or not explicitly stated):
            - businessName (string)
            - adminPin (string, exactly 4 digits)
            - bankName (string)
            - accountNumber (string, exactly 10 digits)
            - accountName (string)
            
            Do NOT guess. If the user says "I don't know", return null.
            `;
            
            const result = await model.generateContent(extractionPrompt);
            const extracted = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
            
            console.log(`🧠 [GREEDY EXTRACTION] Found:`, extracted);

            // --- LOCALE-AWARE VALIDATION ---
            const currency = org.currency || { code: 'NGN' };
            
            if (extracted.businessName) nextData.name = extracted.businessName;
            if (extracted.adminPin && /^\d{4}$/.test(extracted.adminPin)) {
                const bcrypt = await import('bcrypt');
                nextData.adminPin = await bcrypt.hash(extracted.adminPin, 10);
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
            console.warn(`⚠️ [EXTRACTION FAILED]`, e);
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
             'TONE': 'BANK_ACCOUNT_NAME'
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
          reply = "Bank details set! 💰\n\n*Step 4 (Final):* How should I talk to your customers?\n\n1. *Professional* (Official & Polite)\n2. *Street-Smart* (Mix of English & Pidgin)\n\nType 1 or 2.";
      } else if (nextStep === 'TONE') {
          if (text !== '1' && text !== '2') {
              reply = "Please type *1* for Professional or *2* for Street-Smart.";
          } else {
              const tone = text === '1' ? 'Professional' : 'Street-Smart';
              const prompt = tone === 'Professional' 
                ? `You are the Professional Assistant for ${nextData.name}. You are polite, efficient, and speak clear English.` 
                : `You are the Street-Smart Apprentice for ${nextData.name}. You speak a sharp mix of English and Nigerian Pidgin. You are WITTY, LOYAL, and respect the hustle. You call the Boss 'Oga' or 'Madam'. Use vibes like "No shaking," "Sharp-sharp," and "I dey for you," but keep your work professional.`;
              
              nextData.systemPrompt = prompt;
              
              await completeOnboarding(orgId, nextData);
              
              const giftAmount = formatCurrency(1000, currency.locale, currency.code);
              const examplePrice = formatCurrency(100, currency.locale, currency.code);
              reply = `🎉 *SETUP COMPLETE!*\n\nI am now the ${tone} Apprentice for *${nextData.name}*.\n\n🎁 *Oga Boss, I have gifted you ${giftAmount} in AI credits* so you can see how I work! \n\n*Safety Check:* I have automatically UNLOCKED your session for the next 2 hours. You can start training me right now without typing your PIN!\n\n*Next Step: Training* 🧠\nMy shop is currently empty. To start selling, I need to know your prices.\n\n👉 *Pro-Tip:* You fit just **snap a photo of your Price List** and send am to me. I go extract all the items sharp-sharp!\n\n*Or type:* "The price of Pure Water is ${examplePrice}"`;
              nextStep = 'COMPLETE';
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
