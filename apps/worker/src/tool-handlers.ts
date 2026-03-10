import { 
  saveKnowledge, 
  deleteKnowledge, 
  saveProduct, 
  deleteProduct, 
  searchProducts, 
  bookSlot, 
  authorizeStaff, 
  deactivateStaff, 
  updateActivity, 
  incrementDailySales, 
  setOrgActive, 
  getWeeklySummary, 
  createTenant, 
  topupTenant,
  getNetworkStats,
  setMfaCode,
  checkTransaction,
  logTransaction,
  logPendingTransaction,
  verifyAdminPin,
  setAdminAuth,
  WhatsAppService,
  reportFraud,
  checkFraud,
  getOrgStats,
  getActiveOrganizations,
  getStaff,
  getDb,
  registerTrialInterest,
  getPendingSetups,
  activateTenant
} from '@naija-agent/firebase';
import { PaymentProvider } from '@naija-agent/payments';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';

export interface HandlerContext {
  orgId: string;
  from: string;
  isStaff: boolean;
  isAdmin: boolean;
  isAuth: boolean;
  whatsappService: WhatsAppService;
  paymentProvider: PaymentProvider | null;
  redisClient: Redis;
  orgConfig: any;
  customerName?: string;
}

/**
 * List of tools that REQUIRE active 2-hour session auth (Phase 5.8+)
 */
const AUTH_REQUIRED_TOOLS = [
  'save_knowledge', 'delete_knowledge', 'save_product', 'delete_product', 
  'authorize_staff', 'deactivate_staff', 'set_bot_status', 'create_tenant', 
  'topup_tenant', 'generate_login_code', 'broadcast_to_bosses', 'audit_tenant', 'report_fraud'
];

export async function handleToolCall(
  name: string, 
  args: any, 
  ctx: HandlerContext
): Promise<any> {
  const { orgId, from, isStaff, isAdmin, isAuth, whatsappService, paymentProvider, redisClient, orgConfig, customerName } = ctx;

  // 🛡️ [SPINAL CORD]: Deterministic Security Gatekeeper
  // If the tool is Boss-Only and the session is not auth'd, kill it immediately.
  if (AUTH_REQUIRED_TOOLS.includes(name) && !isAuth) {
    return { 
      status: 'error', 
      code: 'AUTH_REQUIRED', 
      message: 'This action is LOCKED. Oga, please type your 4-digit PIN to proceed.' 
    };
  }

  switch (name) {
    case 'get_payment_instructions':
      if (args.purpose === 'refill') {
        const details = orgConfig?.sovereignBankDetails;
        if (!details) return { status: 'error', message: 'Sovereign bank details not configured. Please contact support.' };
        return { status: 'success', purpose: 'refill', details };
      } else {
        const details = orgConfig?.bankDetails;
        if (!details) return { status: 'error', message: 'Business bank details not configured. Please ask the Boss.' };
        return { status: 'success', purpose: 'sale', details };
      }

    case 'generate_order_summary':
      const bank = orgConfig?.bankDetails;
      if (!bank) return { status: 'error', message: 'Bank details not set. Please ask the Boss.' };
      
      let items = args.items;
      let total = args.total;
      let orderId = args.orderId;

      // --- CART AWARENESS (PHASE 7) ---
      // If AI is lazy or to prevent manipulation, we fetch the REAL cart total
      if (!items || !total) {
          const cart = await (await import('@naija-agent/firebase')).getCart(orgId, from);
          if (cart.items.length === 0) return { status: 'error', message: 'Cart is empty. Please add items first.' };
          
          items = cart.items.map(i => `- ${i.name} (x${i.quantity})`).join('\n');
          total = cart.totalKobo / 100;
          orderId = orderId || `ORD-${Date.now().toString().substring(7)}`;
      }
      
      const summaryBlock = `📦 *ORDER SUMMARY: ${orderId}*\n\n` +
        `📝 *Items:* \n${items}\n\n` +
        `💰 *Total:* ₦${total.toLocaleString()}\n\n` +
        `🏦 *Bank:* ${bank.bankName}\n` +
        `🔢 *Account:* ${bank.accountNumber}\n` +
        `👤 *Name:* ${bank.accountName}\n\n` +
        `⚠️ *Price Lock:* Valid for 24 hours only.`;

      // --- AUTO-CLEAR CART (PHASE 7) ---
      // Once a summary is generated, the cart is "checked out" to prevent stale data.
      await (await import('@naija-agent/firebase')).clearCart(orgId, from);

      return { status: 'success', summary: summaryBlock, totalNaira: total };

    case 'assign_task_to_staff':
      if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      const staffMember = await getStaff(orgId, args.staffPhone);
      if (!staffMember) return { status: 'error', message: 'Staff member not found or inactive.' };

      await updateActivity(orgId, args.activityId, 'task', { 
        status: 'pending', 
        assignedStaffPhone: args.staffPhone,
        summary: `Instruction: ${args.instruction || 'N/A'}`
      });

      // Notify the staff member
      const staffMessage = `🚀 *NEW TASK ASSIGNED*\n\nOga has assigned Activity *${args.activityId}* to you.\n\n*Instruction:* ${args.instruction || 'None'}.\n\nGood luck!`;
      await whatsappService.sendText(args.staffPhone, staffMessage);

      return { status: 'success', message: `Task ${args.activityId} assigned to ${staffMember.name}. I have informed them on WhatsApp.` };

    case 'generate_refill_link':
      if (!isAdmin) return { status: 'error', message: 'Only the Boss can generate a refill link.' };
      if (args.amount < 2000) return { status: 'error', message: 'Minimum refill amount is ₦2,000.' };
      
      if (!paymentProvider) return { status: 'error', message: 'Online payments not configured. Please use bank transfer instead.' };

      const email = `${orgId}@naijaagent.core`; // Virtual email for Paystack tracking
      const link = await paymentProvider.createPaymentLink(orgId, email, args.amount);
      
      if (link) {
        return { 
          status: 'success', 
          link, 
          message: `Oga, here is your secure Paystack link to buy ₦${args.amount.toLocaleString()} credit. Once you pay, I will credit your bot instantly!\n\n🔗 ${link}`
        };
      }
      return { status: 'error', message: 'Failed to generate payment link. Please try again.' };

    case 'verify_transaction':
      const existingTx = await checkTransaction(orgId, args.reference);
      
      if (existingTx) {
         if (existingTx.status === 'success') {
            return { status: 'verified', code: 'ALREADY_DONE', data: existingTx };
         } else if (existingTx.status === 'pending') {
            return { status: 'pending', code: 'AWAITING_BANK', message: "Recorded. Waiting for bank signal." };
         } else {
            return { status: 'failed', code: 'DUPLICATE' };
         }
      } 
      
      let verifiedTx = null;
      if (paymentProvider) {
          const tx = await paymentProvider.verify(args.reference, args.amount);
          if (tx && tx.status === 'success') {
              verifiedTx = tx;
          }
      }

      if (verifiedTx) {
          await logTransaction(orgId, args.reference, { 
            ...verifiedTx, 
            extractedBank: args.bankName, 
            extractedDate: args.date,
            purpose: args.purpose
          });

          // --- AUTOMATIC REFILL HANDSHAKE ---
          if (args.purpose === 'refill' && isAdmin) {
              const refillResult = await topupTenant(orgId, args.amount, args.reference);
              if (refillResult) {
                return { 
                  status: 'verified', 
                  code: 'REFILL_SUCCESS', 
                  message: `₦${args.amount.toLocaleString()} verified and credited to your bot! New balance: ₦${(refillResult.newBalance / 100).toLocaleString()}`,
                  data: verifiedTx 
                };
              }
          }

          return { status: 'verified', data: verifiedTx };
      } else if (orgConfig?.useSmsBridge) {
          await logPendingTransaction(orgId, from, args.amount, args.reference);
          return { status: 'pending', code: 'BRIDGE_AWAIT', message: "Logged. Waiting for bank SMS confirmation." };
      } else {
          // --- VISION-FIRST MODE (PHASE 5.18) ---
          // Merchant doesn't have a bridge, so we "Trust" the AI Vision for now.
          const HIGH_VALUE_THRESHOLD = 10000;
          const isHighValue = args.amount >= HIGH_VALUE_THRESHOLD;

          if (isHighValue) {
              console.warn(`🛡️ [VALUE GUARD] High-value receipt (${args.amount}) detected for ${orgId} without bridge.`);
              await logPendingTransaction(orgId, from, args.amount, args.reference);
              
              if (orgConfig?.adminPhone) {
                  const alert = `⚠️ *HIGH VALUE RECEIPT*\n\nA customer (${from}) sent a receipt for *₦${args.amount.toLocaleString()}* (Ref: ${args.reference}).\n\nBecause this is a large amount and you don't have an SMS Bridge, I have *NOT* verified it automatically. Please check your bank and confirm manually!`;
                  await whatsappService.sendText(orgConfig.adminPhone, alert);
              }

              return { 
                status: 'pending', 
                code: 'HIGH_VALUE_VISION', 
                message: "This is a large amount. We are verifying it with our bank manually. Please wait." 
              };
          }

          await logTransaction(orgId, args.reference, {
              status: 'success',
              amount: args.amount,
              method: 'vision_only',
              extractedBank: args.bankName,
              extractedDate: args.date
          });

          // Warn the Boss
          if (orgConfig?.adminPhone) {
              const warning = `👁️ *VISION VERIFICATION*\n\nOga, I have accepted a receipt for *₦${args.amount.toLocaleString()}* (Ref: ${args.reference}).\n\n*Note:* I verified this using my eyes only. Since the SMS Bridge is not set up, please confirm the money is in your bank!`;
              await whatsappService.sendText(orgConfig.adminPhone, warning);
          }

          return { 
            status: 'verified', 
            code: 'VISION_ONLY', 
            message: "I have seen your receipt. Thank you! We are processing your request." 
          };
      }

    case 'verify_admin_pin':
      if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      
      const lockoutKey = `lockout:admin_pin:${orgId}:${from}`;
      const attempts = await redisClient.get(lockoutKey);
      
      if (attempts && parseInt(attempts) >= 3) {
        return { status: 'error', code: 'LOCKED_OUT', message: 'Too many incorrect attempts. Locked for 15 mins.' };
      }

      const isCorrect = await verifyAdminPin(orgId, args.pin);
      if (isCorrect) {
        await redisClient.del(lockoutKey);
        await setAdminAuth(orgId, from);
        return { status: 'success', code: 'UNLOCKED', message: 'PIN Verified. Session active for 2 hours.' };
      } else {
        const newAttempts = await redisClient.incr(lockoutKey);
        if (newAttempts === 1) await redisClient.expire(lockoutKey, 900);
        const remaining = 3 - newAttempts;
        return { status: 'error', code: 'WRONG_PIN', remaining };
      }

    case 'escalate_to_boss':
      if (isAdmin) return { status: 'error', message: 'You are the Boss! Why escalate to yourself?' };
      if (!orgConfig?.adminPhone) return { status: 'error', message: 'No admin phone configured for escalation.' };
      
      const alertMessage = `📣 [ESCALATION NEEDED]\nOga, I need help with Customer *${customerName || 'Unknown'}* (${from}).\nReason: ${args.reason}`;
      await whatsappService.sendText(orgConfig.adminPhone, alertMessage);
      return { status: 'success', message: "I've informed the Boss. They will get back to you soon. How else can I help?" };

    case 'save_knowledge':
      await saveKnowledge(orgId, args.key, args.content, args.imageUrl);
      return { status: 'success', code: 'SAVED', key: args.key };

    case 'delete_knowledge':
      await deleteKnowledge(orgId, args.key);
      return { status: 'success', code: 'DELETED', key: args.key };

    case 'save_product':
      await saveProduct(orgId, args.id, {
        name: args.name,
        price: args.price,
        stock: args.stock,
        category: args.category,
        imageUrl: args.imageUrl
      });
      return { status: 'success', code: 'SAVED', product: args.name };

    case 'manage_stock':
      const { decrementStock } = await import('@naija-agent/firebase');
      let finalStock = 0;
      if (args.action === 'set') {
          await saveProduct(orgId, args.id, { stock: args.amount, lowStockThreshold: args.threshold } as any);
          finalStock = args.amount;
      } else if (args.action === 'add') {
          await saveProduct(orgId, args.id, { stock: FieldValue.increment(args.amount), lowStockThreshold: args.threshold } as any);
          // We don't have the current value easily without a read, but we can return success
          return { status: 'success', message: `Added ${args.amount} to stock for ${args.productId}.` };
      } else if (args.action === 'reduce') {
          finalStock = await decrementStock(orgId, args.id, args.amount);
      }
      return { status: 'success', message: `Stock for ${args.productId} is now ${finalStock}.`, stock: finalStock };

    case 'delete_product':      await deleteProduct(orgId, args.id);
      return { status: 'success', code: 'DELETED' };

    case 'search_products':
      const products = await searchProducts(orgId, args.query);
      return { status: 'success', data: products };

    case 'get_shipping_rates':
      const { getLogisticsProvider } = await import('@naija-agent/logistics');
      const logisticsApiKey = orgConfig?.logistics?.apiKey || process.env.TERMINAL_AFRICA_API_KEY;
      const logisticsType = orgConfig?.logistics?.provider || (logisticsApiKey ? 'terminal' : 'mock');
      
      const provider = getLogisticsProvider(logisticsType as any, logisticsApiKey);
      const rates = await provider.getRates({
        origin: args.origin,
        destination: args.destination,
        weightKg: args.weightKg
      });

      if (rates.length === 0) {
        return { status: 'success', message: 'No shipping rates found for this route.' };
      }

      const rateSummary = rates.map(r => `🚚 *${r.provider}* (${r.service}): *₦${r.amount.toLocaleString()}* (${r.deliveryTime})`).join('\n');
      return { status: 'success', data: rates, summary: `📦 *SHIPPING QUOTES:*\n\n${rateSummary}\n\nOga, which one you prefer?` };

    case 'track_shipment':
      const { getLogisticsProvider: getLogProvider } = await import('@naija-agent/logistics');
      const trackApiKey = orgConfig?.logistics?.apiKey || process.env.TERMINAL_AFRICA_API_KEY;
      const trackType = orgConfig?.logistics?.provider || (trackApiKey ? 'terminal' : 'mock');

      const trackProvider = getLogProvider(trackType as any, trackApiKey);
      const status = await trackProvider.track(args.trackingNumber);

      if (!status) {
        return { status: 'error', message: 'Tracking number not found.' };
      }

      const statusMsg = `📍 *TRACKING STATUS:* ${args.trackingNumber}\n\n` +
        `🚩 *Status:* ${status.status.toUpperCase()}\n` +
        `🏠 *Location:* ${status.location}\n` +
        `📝 *Update:* ${status.description}\n` +
        `🕒 *Time:* ${new Date(status.timestamp).toLocaleString()}`;

      return { status: 'success', data: status, summary: statusMsg };

    case 'add_to_cart':
      const addResult = await (await import('@naija-agent/firebase')).addToCart(
        orgId, 
        from, 
        args.productId, 
        args.quantity || 1
      );
      return addResult.success 
        ? { status: 'success', message: `Added to cart.` } 
        : { status: 'error', message: addResult.message };

    case 'view_cart':
      const cartData = await (await import('@naija-agent/firebase')).getCart(orgId, from);
      if (cartData.items.length === 0) return { status: 'success', message: 'Your cart is empty.', total: 0 };

      const itemList = cartData.items.map(item => `- ${item.name} (x${item.quantity}): ₦${item.price.toLocaleString()}`).join('\n');
      const totalNaira = cartData.totalKobo / 100;

      return { 
        status: 'success', 
        items: cartData.items, 
        summary: `🛒 *YOUR CART:*\n${itemList}\n\n💰 *Total:* ₦${totalNaira.toLocaleString()}`, 
        totalNaira 
      };

    case 'remove_from_cart':
      const removeResult = await (await import('@naija-agent/firebase')).removeFromCart(
        orgId, from, args.productId, args.quantity
      );
      return removeResult.success 
        ? { status: 'success', message: `Updated cart: ${removeResult.message}` }
        : { status: 'error', message: removeResult.message };

    case 'clear_cart':
      await (await import('@naija-agent/firebase')).clearCart(orgId, from);
      return { status: 'success', message: 'Cart cleared.' };


    case 'book_slot':
      const bookingId = `BKG-${Date.now()}`;
      try {
        await bookSlot(orgId, bookingId, {
          startTime: args.startTime,
          summary: args.summary,
          customerPhone: args.customerPhone
        });
        return { status: 'success', code: 'BOOKED', bookingId };
      } catch (e: any) {
        if (e.message === 'SLOT_TAKEN') {
          return { status: 'error', code: 'SLOT_TAKEN' };
        }
        throw e;
      }

    case 'authorize_staff':
      await authorizeStaff(orgId, args.phone, args.name, args.role);
      return { status: 'success', code: 'AUTHORIZED', name: args.name };

    case 'deactivate_staff':
      await deactivateStaff(orgId, args.phone);
      return { status: 'success', code: 'DEACTIVATED' };

    case 'manage_activity':
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
      return { status: 'success', code: 'UPDATED', type: args.type };

    case 'set_bot_status':
      await setOrgActive(orgId, args.active);
      return { status: 'success', message: `Bot service is now ${args.active ? 'ONLINE' : 'OFFLINE (Maintenance Mode)'}.` };

    case 'get_business_report':
      const snapshots = await getWeeklySummary(orgId);
      return { status: 'success', data: snapshots, message: 'Here is the report. Please analyze it and provide recommendations.' };

    case 'send_broadcast':
      if (!isAdmin) return { status: 'error', code: 'UNAUTHORIZED' };
      
      // Fetch recent unique customers for this org
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
            orgId: 'system', // Free for the Boss to broadcast, or we can charge here
            phoneId: org.whatsappPhoneId,
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

    case 'create_tenant':
      await createTenant({
        id: args.id,
        name: args.name,
        whatsappPhoneId: args.phoneId,
        adminPhone: args.adminPhone,
        systemPrompt: args.prompt
      });
      
      // --- Phase 5.8: Auto-Pulse Scheduling ---
      try {
        const { Queue } = await import('bullmq');
        const whatsappQueue = new Queue('whatsapp-queue', { 
          connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
          }
        });

        // 1. Daily Report (8 AM Lagos)
        await whatsappQueue.add('daily-report', 
          { orgId: args.id, from: args.adminPhone, type: 'text', timestamp: Date.now(), messageId: `auto_${Date.now()}`, content: {} }, 
          { repeat: { cron: '0 7 * * *' }, jobId: `daily-report:${args.id}`, removeOnComplete: true }
        );

        // 2. Health Guardian (Every 10 mins)
        await whatsappQueue.add('check-bridge-health', 
          { orgId: args.id },
          { repeat: { cron: '*/10 * * * *' }, jobId: `health-check:${args.id}`, removeOnComplete: true }
        );

        // 3. Appointment Nudges (Every hour)
        await whatsappQueue.add('hourly-reminder-scan', 
          { orgId: args.id },
          { repeat: { cron: '0 * * * *' }, jobId: `reminder-scan:${args.id}`, removeOnComplete: true }
        );

        console.log(`✅ [AUTO-PULSE] Scheduled all proactive jobs for new tenant: ${args.id}`);
      } catch (schedError: any) {
        console.error(`⚠️ [AUTO-PULSE] Failed to schedule for ${args.id}:`, schedError.message);
        // We don't fail the whole tool call, the tenant is already created.
      }

      if (args.wabaId) {
         await whatsappService.subscribeWaba(args.wabaId);
      }
      return { status: 'success', message: `Tenant '${args.name}' created. Proactive pulse active.` };

    case 'topup_tenant':
      const result = await topupTenant(args.tenantId, args.amount, args.reference);
      if (result) {
        return { status: 'success', message: `Successfully added ₦${args.amount.toLocaleString()} to ${args.tenantId}. New balance: ₦${(result.newBalance / 100).toLocaleString()}.` };
      }
      return { status: 'error', message: 'Top-up failed. Reference might be used.' };

    case 'broadcast_to_bosses':
      if (!isAdmin || !orgConfig?.isMaster) return { status: 'error', code: 'UNAUTHORIZED' };
      
      const orgs = await getActiveOrganizations();
      let count = 0;

      const whatsappQueue = new Queue('whatsapp-queue', { 
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
        }
      });

      for (const org of orgs) {
        if (org.config?.adminPhone) {
          await whatsappQueue.add('process-message', {
            type: 'text',
            orgId: 'system',
            phoneId: org.whatsappPhoneId,
            from: org.config.adminPhone,
            timestamp: Date.now(),
            content: { text: `📣 *SOVEREIGN DECREE*\n\n${args.message}` }
          }, { 
            delay: count * 5000, // 5s jitter per message
            removeOnComplete: true 
          });
          count++;
        }
      }
      return { status: 'success', message: `Broadcast queued for ${count} Bosses with 5s jitter.` };

    case 'audit_tenant':
      if (!isAdmin || !orgConfig?.isMaster) return { status: 'error', code: 'UNAUTHORIZED' };
      const auditStats = await getOrgStats(args.tenantId);
      const bridgeHeartbeat = await redisClient.get(`bridge_heartbeat:${args.tenantId}`);
      
      return { 
        status: 'success', 
        data: {
          ...auditStats,
          bridgeStatus: bridgeHeartbeat ? 'ONLINE' : 'OFFLINE',
          lastSeen: bridgeHeartbeat ? new Date(parseInt(bridgeHeartbeat)).toISOString() : 'Never'
        } 
      };

    case 'report_fraud':
      if (!isAdmin || !orgConfig?.isMaster) return { status: 'error', code: 'UNAUTHORIZED' };
      await reportFraud(args.phone, args.reason);
      return { status: 'success', message: `Customer ${args.phone} added to Global Fraud Blacklist.` };

    case 'register_trial_interest':
      // Prevent overwriting existing merchants
      const dbInstance = getDb();
      const existing = await dbInstance.collection('organizations').doc(args.id).get();
      if (existing.exists) return { status: 'error', message: 'This business ID is already taken. Please choose another name.' };

      await registerTrialInterest({
        id: args.id,
        name: args.name,
        adminPhone: args.adminPhone,
        botPhone: args.botPhone
      });
      
      // Notify Sovereign
      if (process.env.MASTER_ADMIN_PHONE) {
        const alert = `🆕 *NEW TRIAL LEAD*\n\nBusiness: ${args.name}\nBoss: ${args.adminPhone}\nBot SIM: ${args.botPhone}\n\nOga, please verify credit payment then add to Meta.`;
        await whatsappService.sendText(process.env.MASTER_ADMIN_PHONE, alert);
      }
      
      return { status: 'success', message: `Interest registered for ${args.name}. Oga Sovereign has been notified. We will send your activation code shortly.` };

    case 'request_otp_relay':
      if (!isAdmin || !orgConfig?.isMaster) return { status: 'error', code: 'UNAUTHORIZED' };
      const pipelineData = await getPendingSetups();
      const pendingTenant = pipelineData.find(t => t.id === args.tenantId);
      if (!pendingTenant) return { status: 'error', message: 'Tenant not found in pipeline.' };

      // Update state to AWAITING_OTP
      await (await getDb()).collection('organizations').doc(args.tenantId).update({ status: 'AWAITING_OTP' });

      // Ping the Client
      const relayMsg = `📢 *ACTIVATION READY*\n\nOga Boss is ready to move your bot to the cloud. Are you holding the phone for SIM *${pendingTenant.config?.botPhone || 'N/A'}*?\n\nPlease type *READY* to receive your 5-minute activation code.`;
      await whatsappService.sendText(pendingTenant.config.adminPhone, relayMsg);

      return { status: 'success', message: `Relay initiated for ${args.tenantId}. Client notified.` };

    case 'activate_tenant':
      if (!isAdmin || !orgConfig?.isMaster) return { status: 'error', code: 'UNAUTHORIZED' };
      
      // Update the organization record
      await activateTenant(args.tenantId, args.phoneId, args.accessToken);
      
      // Find the tenant in the pipeline to get the admin phone
      const pipe = await getPendingSetups();
      const target = pipe.find(t => t.id === args.tenantId);

      // Send Success Kit to Client
      const successKit = `🎉 *CONGRATULATIONS!*\n\nYour Digital Apprentice is now LIVE!\n\n*Your Next 3 Steps:* \n1. Message your new bot number.\n2. Type *#setup* to name your shop.\n3. Add your first product!\n\nGo kill it! 🚀`;
      if (target?.config?.adminPhone) {
        await whatsappService.sendText(target.config.adminPhone, successKit);
      }

      return { status: 'success', message: `Tenant ${args.tenantId} is now ACTIVE and notified.` };

    case 'get_pending_setups':
      if (!isAdmin || !orgConfig?.isMaster) return { status: 'error', code: 'UNAUTHORIZED' };
      const setups = await getPendingSetups();
      if (setups.length === 0) return { status: 'success', message: 'Pipeline is empty. No pending setups.' };

      const setupSummary = setups.map((t, i) => `${i+1}. *${t.name}* (${t.status}) - SIM: ${t.config?.botPhone || 'N/A'}`).join('\n');
      return { status: 'success', message: `🚩 *SETUP PIPELINE*\n\n${setupSummary}` };

    case 'get_network_stats':
      const stats = await getNetworkStats();
      return { status: 'success', data: stats };

    case 'generate_login_code':
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await setMfaCode(orgId, code);
      return { status: 'success', code, message: 'Code generated. Share with the Boss. It expires in 5 minutes.' };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
