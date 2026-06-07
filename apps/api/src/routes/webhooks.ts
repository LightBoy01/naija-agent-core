import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { WhatsAppWebhookSchema, JobData, parseAndFormatPhone } from '@naija-agent/types';
import { 
  getOrgById, 
  topupOrg as topupOrgSql, 
  getOrgByPhoneId, 
  setOptOut, 
  checkOptOut,
  findOrgByAdminPhone
} from '@naija-agent/database';
import { getProvider } from '@naija-agent/payments';
import { formatCurrency } from '../utils/currency.js';

export interface WebhookRouteOptions {
  whatsappQueue: any;
  lifeQueue: any;
  redisConnection: any;
  logger: any;
}

// Send Typing Indicator and Mark as Read
async function sendTypingIndicator(phoneId: string, messageId: string, token: string, logger: any, from?: string) {
  try {
    const sovereignIds = ['aelixxr', 'zynux', 'naija-agent-master', '2349015772541', '2347011925076', '1034379023092936'];
    const isSovereign = phoneId.startsWith('baileys-') || sovereignIds.includes(phoneId) || !/^\d+$/.test(phoneId);

    if (isSovereign) {
       let orgId = phoneId.replace('baileys-', '');
       if (orgId === '2349015772541') orgId = 'aelixxr';
       if (orgId === '2347011925076') orgId = 'zynux';
       if (orgId === '1034379023092936') orgId = 'naija-agent-master';

       const sidecarUrl = process.env.SIDECAR_URL || 'http://localhost:8080';
       const apiKey = process.env.ADMIN_API_KEY;

       import('axios').then(axios => {
           axios.default.post(`${sidecarUrl}/typing`, { 
               orgId, 
               to: from || 'SYSTEM_MARK_READ' 
           }, {
               headers: { 'X-API-Key': apiKey || '' }
           }).catch(e => {
                // Ignore errors
           });
       });
       return;
    }

    const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };
    
    // Non-blocking fire and forget
    import('axios').then(axios => {
        axios.default.post(url, body, { 
          headers: { Authorization: `Bearer ${token}` } 
        }).catch(e => {
          logger.warn({ error: e.message, messageId }, 'Failed to send typing indicator (non-critical)');
        });
    });
  } catch (e) {
    // Silently fail as this is a non-critical UX enhancement
  }
}

// Verify X-Hub-Signature-256
function verifySignature(payload: string, signature: string, secret: string, logger: any): boolean {
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', secret);
  const calculated = 'sha256=' + hmac.update(payload).digest('hex');
  logger.debug({ received: signature, calculated }, '🛡️ [DEBUG] Signature Verification');
  const digest = Buffer.from(calculated, 'utf8');
  const checksum = Buffer.from(signature, 'utf8');
  return digest.length === checksum.length && crypto.timingSafeEqual(digest, checksum);
}

export default async function webhookRoutes(fastify: FastifyInstance, opts: WebhookRouteOptions) {
  const { whatsappQueue, lifeQueue, redisConnection, logger } = opts;

  // 2. Webhook Verification (GET)
  fastify.get('/webhook', async (request, reply) => {
    const query = request.query as {
      'hub.mode': string;
      'hub.verify_token': string;
      'hub.challenge': string;
    };

    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      reply.status(200).send(challenge);
    } else {
      reply.status(403).send('Forbidden');
    }
  });

  // 3. Webhook Ingestion (POST)
  fastify.post('/webhook/paystack', async (request, reply) => {
    const signature = request.headers['x-paystack-signature'] as string;
    const rawBody = (request as any).rawBody as string;

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return reply.status(500).send('Paystack secret key not configured');
    }

    const paystack = getProvider('paystack', process.env.PAYSTACK_SECRET_KEY) as any;
    
    if (!paystack.verifyWebhookSignature(rawBody, signature)) {
      logger.warn('❌ Invalid Paystack Webhook Signature!');
      return reply.status(403).send('Invalid Signature');
    }

    const payload = request.body as any;
    if (payload.event !== 'charge.success') {
      return reply.status(200).send('Ignored');
    }

    const { reference, amount, metadata } = payload.data;
    const orgId = metadata?.orgId;

    if (!orgId) {
      logger.warn({ reference }, '⚠️ Received Paystack top-up without orgId metadata.');
      return reply.status(200).send('OK'); // Acknowledge anyway
    }

    try {
      const amountVal = amount / 100; // Paystack sends amount in Kobo/Cents
      const result = await topupOrgSql(orgId, amountVal, reference);

      if (result) {
        const org = await getOrgById(orgId);
        const currency = (org?.config as any)?.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };
        const formattedAmount = formatCurrency(amountVal, currency.locale, currency.code);
        const formattedBalance = formatCurrency(result.newBalance / 100, currency.locale, currency.code);
        
        logger.info({ orgId, amount: amountVal, reference }, `✅ [PAYSTACK] Processed top-up.`);
        
        if ((org?.config as any)?.adminPhone) {
          let notificationMsg = "";
          const greeting = org.region === 'NG' ? 'Oga' : 'Hello';
          
          if (metadata?.purpose === 'refill') {
             notificationMsg = `✅ *AI Credit Refill Successful!*\n\n${greeting}, your account has been credited with *${formattedAmount}* (Ref: ${reference}).\n\nYour new balance is *${formattedBalance}*.`;
          } else {
             notificationMsg = `💰 *NEW SALE CONFIRMED (Paystack)!*\n\n${greeting}, a customer has just paid *${formattedAmount}*.\n\nOrder Ref: ${reference}\nNew Bot Balance: ${formattedBalance}.`;
          }

          const notificationJob: JobData = {
            type: 'text',
            orgId: 'system',
            phoneId: org.whatsappPhoneId,
            from: (org.config as any).adminPhone,
            messageId: `BR-${Date.now()}`,
            timestamp: Date.now(),
            content: { text: notificationMsg }
          };
          await whatsappQueue.add('process-message', notificationJob, { removeOnComplete: true });
        }
      }
    } catch (e: any) {
      if (e.message === 'DUPLICATE_REFERENCE') {
        logger.info({ reference }, '⏭️ [PAYSTACK] Duplicate top-up ignored.');
      } else {
        logger.error({ reference, error: e.message }, '❌ Paystack processing error');
      }
    }

    return reply.status(200).send('OK');
  });

  // 3b. Webhook Ingestion (Monnify)
  fastify.post('/webhook/monnify', async (request, reply) => {
    const signature = request.headers['monnify-signature'] as string;
    const rawBody = (request as any).rawBody as string;

    const payload = request.body as any;
    const reference = payload.eventData?.paymentReference;
    const amountPaid = payload.eventData?.amountPaid || payload.eventData?.amount;
    const accountReference = payload.eventData?.accountReference;

    // 1. Check for Aelixxr Vault Deposit (Automated Virtual Account)
    if (accountReference && accountReference.startsWith('aelixxr_vault_')) {
        const userPhone = accountReference.replace('aelixxr_vault_', '');
        logger.info({ phone: userPhone, amountPaid, reference }, '🏦 [MONNIFY] Automated Vault Deposit Detected');
        
        try {
            await lifeQueue.add('life-vault-deposit', {
                userPhone,
                amountPaid,
                reference: reference || payload.eventData?.transactionReference
            }, { removeOnComplete: true });
            
            const newBalance = "Pending";
            
            if (newBalance !== null) {
                const notificationJob: JobData = {
                    type: 'text',
                    orgId: 'system',
                    phoneId: process.env.AELIXXR_PHONE_ID || '',
                    from: userPhone,
                    messageId: `BR-${Date.now()}`,
                    timestamp: Date.now(),
                    content: { text: `✅ *Vault Deposit Successful!*\n\nOga, your Monnify transfer of ₦${amountPaid} was received.\n\nYour new Vault balance is *₦${newBalance}*. Send me a message to convert it to Energy!` }
                };
                await whatsappQueue.add('process-message', notificationJob, { removeOnComplete: true });
            }
        } catch (err: any) {
            if (err.message === 'DUPLICATE_REFERENCE') {
               logger.info({ reference }, '⏭️ [MONNIFY] Duplicate vault deposit ignored.');
            } else {
               logger.error({ reference, error: err.message }, '❌ Vault deposit processing error');
            }
        }
        return reply.status(200).send('OK');
    }
    
    let orgId: string | undefined = undefined;
    if (reference && reference.startsWith('refill_')) {
       orgId = reference.split('_')[1];
    }

    if (!orgId) {
      logger.warn({ reference }, '⚠️ Received Monnify webhook without recognizable orgId in reference.');
      return reply.status(200).send('OK');
    }

    const org = await getOrgById(orgId);
    const monnifyKey = (org?.config as any)?.payment?.secretKey || process.env.MONNIFY_SECRET_KEY;

    if (!monnifyKey) {
      return reply.status(500).send('Monnify secret key not found');
    }

    const monnify = getProvider('monnify', monnifyKey) as any;
    
    if (!monnify.verifyWebhookSignature(rawBody, signature)) {
      logger.warn('❌ Invalid Monnify Webhook Signature!');
      return reply.status(403).send('Invalid Signature');
    }

    if (payload.eventType !== 'SUCCESSFUL_TRANSACTION') {
      return reply.status(200).send('Ignored');
    }
    
    try {
      const result = await topupOrgSql(orgId, amountPaid, reference);

      if (result) {
        logger.info({ orgId, amount: amountPaid, reference }, `✅ [MONNIFY] Processed top-up.`);
        
        if ((org?.config as any)?.adminPhone) {
          const currency = (org.config as any)?.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };
          const formattedAmount = formatCurrency(amountPaid, currency.locale, currency.code);
          const formattedBalance = formatCurrency(result.newBalance / 100, currency.locale, currency.code);

          const notificationMsg = `✅ *AI Credit Refill Successful (Monnify)!*\n\nOga, your account has been credited with *${formattedAmount}*.\n\nYour new balance is *${formattedBalance}*.`;

          const notificationJob: JobData = {
            type: 'text',
            orgId: 'system',
            phoneId: org.whatsappPhoneId,
            from: (org.config as any).adminPhone,
            messageId: `BR-${Date.now()}`,
            timestamp: Date.now(),
            content: { text: notificationMsg }
          };
          await whatsappQueue.add('process-message', notificationJob, { removeOnComplete: true });
        }
      }
    } catch (e: any) {
      if (e.message !== 'DUPLICATE_REFERENCE') logger.error({ reference, error: e.message }, '❌ Monnify processing error');
    }

    return reply.status(200).send('OK');
  });

  // 3c. Webhook Ingestion (WhatsApp)
  fastify.post('/webhook', async (request, reply) => {
    logger.debug('📝 [DEBUG] Webhook Hit!');
    const signature = request.headers['x-hub-signature-256'] as string;
    const rawBody = (request as any).rawBody as string;

    let appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      logger.error('CRITICAL: WHATSAPP_APP_SECRET is undefined during webhook processing.');
      return reply.status(500).send('Internal Server Error');
    }
    let phoneId: string | undefined = undefined;

    try {
       const body = JSON.parse(rawBody);
       phoneId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

       if (phoneId) {
          const org = await getOrgByPhoneId(phoneId);
          if ((org?.config as any)?.appSecret) {
             logger.debug({ phoneId }, `🛡️ [DEBUG] Using Custom App Secret`);
             appSecret = (org.config as any).appSecret;
          }
       }
    } catch (e) {
       logger.warn('Could not parse raw body for dynamic secret lookup');
    }

    if (!verifySignature(rawBody, signature, appSecret, logger)) {
      logger.warn({ signature }, `❌ Invalid Webhook Signature!`);
      return reply.status(403).send('Invalid Signature');
    }

    const result = WhatsAppWebhookSchema.safeParse(request.body);
    if (!result.success) {
      logger.error({ err: result.error }, 'Invalid Webhook Payload');
      return reply.status(200).send('OK'); 
    }

    const entry = result.data.entry[0];
    const change = entry.changes[0];
    const value = change.value;

    if (!value.messages || value.messages.length === 0) {
      return reply.status(200).send('OK'); 
    }

    const message = value.messages[0];
    const businessPhoneId = value.metadata.phone_number_id;
    const from = message.from;

    const fromNormalized = parseAndFormatPhone(from) || from;
    let org = await findOrgByAdminPhone(fromNormalized);
    
    if (!org) {
      org = await getOrgByPhoneId(businessPhoneId);
    }
    
    if (!org) {
      logger.warn({ businessPhoneId }, `Unknown Business Phone ID`);
      return reply.status(200).send('OK');
    }

    // --- UX: TRIGGER TYPING INDICATOR ---
    const apiToken = (org.config as any)?.whatsappToken || process.env.WHATSAPP_API_TOKEN;
    if (apiToken) {
      sendTypingIndicator(businessPhoneId, message.id, apiToken, logger, from);
    }

    const processedKey = `processed:${org.id}:${message.id}`;
    const isProcessed = await redisConnection.exists(processedKey);
    if (isProcessed) {
      logger.info({ messageId: message.id, orgId: org.id }, `Duplicate message, skipping.`);
      return reply.status(200).send('OK');
    }

    await redisConnection.setex(processedKey, 3600, '1');

    const textBody = message.type === 'text' ? message.text?.body?.trim().toUpperCase() : '';
    
    if (textBody && ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END'].includes(textBody)) {
      logger.info({ from, orgId: org.id }, `🚫 User opted OUT.`);
      await setOptOut(org.id, from, true);
      return reply.status(200).send('OK');
    }

    if (textBody && ['START', 'SUBSCRIBE', 'UNSTOP'].includes(textBody)) {
      logger.info({ from, orgId: org.id }, `✅ User opted IN.`);
      await setOptOut(org.id, from, false);
      return reply.status(200).send('OK');
    }

    const isOptedOut = await checkOptOut(org.id, from);
    if (isOptedOut) {
      logger.info({ from }, `Skipping message from opted-out user`);
      return reply.status(200).send('OK');
    }

    const isAudioOrVoice = message.type === 'audio' || message.type === 'voice';
    const audioData = message.type === 'audio' ? message.audio : message.voice;

    const jobData: JobData = {
      type: isAudioOrVoice ? 'audio' : message.type === 'image' ? 'image' : (message.type === 'document' ? 'document' : 'text'),
      orgId: org.id,
      phoneId: businessPhoneId,
      from: from,
      name: value.contacts?.[0]?.profile?.name || 'Unknown',
      messageId: message.id,
      timestamp: Date.now(),
      content: {
        text: message.type === 'text' ? message.text?.body : undefined,
        audioId: isAudioOrVoice ? audioData?.id : undefined,
        imageId: message.type === 'image' ? message.image?.id : undefined,
        documentId: message.type === 'document' ? message.document?.id : undefined,
        fileName: message.type === 'document' ? message.document?.filename : undefined,
        caption: message.type === 'image' ? message.image?.caption : (message.type === 'document' ? message.document?.caption : undefined),
        mimeType: isAudioOrVoice ? audioData?.mime_type : (message.type === 'image' ? message.image?.mime_type : (message.type === 'document' ? message.document?.mime_type : undefined)),
      },
    };

    try {
      const isLifeBot = org.id === 'aelixxr' || org.id === 'aelixxr-life-companion';
      
      if (isLifeBot) {
          jobData.type = 'life-chat'; 
          await lifeQueue.add('life-chat', {
              orgId: org.id, 
              userPhone: from,
              message: jobData.content.text || jobData.content.caption || '', 
              imageId: jobData.content.imageId,
              audioId: jobData.content.audioId,
              documentId: jobData.content.documentId,
              mimeType: jobData.content.mimeType,
              phoneId: businessPhoneId
          }, {
              jobId: `life-chat-${message.id}`, 
              removeOnComplete: true,
              attempts: 3
          });
          logger.info({ from, target: 'AELIXXR' }, `🌿 Routed to Life Queue.`);
      } else {
          await whatsappQueue.add('process-message', jobData, {
              removeOnComplete: true,
              removeOnFail: 100, 
              attempts: 3,
              backoff: { type: 'exponential', delay: 1000 },
          });
          logger.info({ from, target: 'ZYNUX' }, `💼 Routed to Business Queue.`);
      }

      return reply.status(200).send('OK');
    } catch (err: any) {
      logger.error({ from, error: err.message }, `🚨 [REDIS_FAIL] Failed to queue message`);
      return reply.status(503).send('Service Unavailable - Queue Error');
    }
  });

  // 4. Outbound Message (POST)
  fastify.post('/send', async (request, reply) => {
    const apiKey = request.headers['x-api-key'];
    if (apiKey !== process.env.ADMIN_API_KEY) {
      return reply.status(401).send('Unauthorized');
    }

    const schema = z.object({
      to: z.string(),
      text: z.string().optional(),
      templateName: z.string().optional(),
      languageCode: z.string().default('en_US'),
      phoneId: z.string().optional(), 
    });

    const result = schema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send(result.error);
    }

    const { to, text, templateName, languageCode, phoneId } = result.data;
    
    if (!text && !templateName) {
      return reply.status(400).send('Either text or templateName is required');
    }

    const effectivePhoneId = phoneId || process.env.WHATSAPP_PHONE_ID;

    if (!effectivePhoneId) {
       return reply.status(400).send('phoneId is required');
    }

    const jobData: JobData = {
      type: templateName ? 'template' : 'text',
      phoneId: effectivePhoneId,
      orgId: 'system', 
      from: to, 
      messageId: `OUT-${Date.now()}`,
      timestamp: Date.now(),
      content: {
        text,
        templateName,
        languageCode,
      },
    };

    await whatsappQueue.add(templateName ? 'send-template' : 'process-message', jobData, {
      removeOnComplete: true,
    });

    return { success: true, jobId: jobData.timestamp };
  });
}
