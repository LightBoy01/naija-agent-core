import { HandlerContext } from './definitions.js';
import { 
  getCart, 
  reserveStock, 
  updateActivity, 
  clearCart, 
  getActivityByCustomer, 
  getStaff, 
  checkTransaction, 
  logTransaction, 
  topupTenant, 
  finalizeSale, 
  logPendingTransaction, 
  logSystemEvent, 
  addToCart, 
  removeFromCart, 
  bookSlot 
} from '@naija-agent/firebase';
import { formatCurrency } from '../utils/currency.js';

export async function handleCommerceTools(name: string, args: any, ctx: HandlerContext): Promise<any> {
  const { orgId, from, isStaff, isAdmin, whatsappService, paymentProvider, redisClient, orgConfig, currency } = ctx;

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

    case 'generate_order_summary': {
      const bank = orgConfig?.bankDetails;
      if (!bank) return { status: 'error', message: 'Bank details not set. Please ask the Boss.' };
      
      let items = args.items;
      let total = args.total;
      let orderId = args.orderId;

      const cart = await getCart(orgId, from);
      if (cart.items.length === 0) return { status: 'error', message: 'Cart is empty. Please add items first.' };
      
      const reserveSuccess = await reserveStock(orgId, cart.items.map(i => ({ productId: i.productId, quantity: i.quantity })));
      if (!reserveSuccess) {
          return { status: 'error', message: 'Oga, some items in your cart just finish! Please check your cart again.' };
      }

      items = cart.items.map(i => `- ${i.name} (x${i.quantity})`).join('\n');
      total = cart.totalKobo / 100;
      orderId = orderId || `ORD-${Date.now().toString().substring(7)}`;
      
      const formattedTotal = formatCurrency(total, currency.locale, currency.code);

      const summaryBlock = `📦 *ORDER SUMMARY: ${orderId}*\n\n` +
        `📝 *Items:* \n${items}\n\n` +
        `💰 *Total:* ${formattedTotal}\n\n` +
        `🏦 *Bank:* ${bank.bankName}\n` +
        `🔢 *Account:* ${bank.accountNumber}\n` +
        `👤 *Name:* ${bank.accountName}\n\n` +
        `⚠️ *Price Lock:* Valid for 2 hours (Stock is reserved).`;

      await updateActivity(orgId, orderId, 'order', {
          status: 'pending_payment',
          summary: `Items:\n${items}`,
          amount: total,
          customerPhone: from,
          metadata: { 
            cartItems: cart.items.map(i => ({ productId: i.productId, quantity: i.quantity, name: i.name })),
            expiresAt: Date.now() + (2 * 60 * 60 * 1000) // 2 Hour Price/Stock Lock
          }
      });

      await clearCart(orgId, from);

      return { status: 'success', summary: summaryBlock, totalNaira: total, orderId };
    }

    case 'check_order_status': {
      const lastActivity = await getActivityByCustomer(orgId, from);
      if (!lastActivity) return { status: 'success', message: "Oga, I no see any recent order for your number. You wan buy something?" };
      
      const statusMap: Record<string, string> = {
          'pending_payment': 'Awaiting Payment ⏳',
          'confirmed': 'Paid & Packaging 📦',
          'ready_for_pickup': 'Ready for Rider 🏁',
          'in_transit': 'On the Way 🚀',
          'delivered': 'Delivered ✅',
          'cancelled': 'Cancelled ❌'
      };

      const friendlyStatus = statusMap[lastActivity.status] || lastActivity.status.toUpperCase();
      return { 
          status: 'success', 
          message: `📍 *ORDER STATUS: ${lastActivity.id}*\n\n*Status:* ${friendlyStatus}\n*Summary:* ${lastActivity.summary.substring(0, 100)}...` 
      };
    }

    case 'generate_refill_link': {
      if (!isAdmin) return { status: 'error', message: 'Only the Boss can generate a refill link.' };
      const minAmount = 2000;
      if (args.amount < minAmount) return { status: 'error', message: `Minimum refill amount is ${formatCurrency(minAmount, currency.locale, currency.code)}.` };
      
      if (!paymentProvider) return { status: 'error', message: 'Online payments not configured. Please use bank transfer instead.' };

      const email = `${orgId}@naijaagent.core`; 
      const link = await paymentProvider.createPaymentLink(orgId, email, args.amount);
      const formattedAmount = formatCurrency(args.amount, currency.locale, currency.code);
      
      if (link) {
        return { 
          status: 'success', 
          link, 
          message: `Oga, here is your secure Paystack link to buy ${formattedAmount} credit. Once you pay, I will credit your bot instantly!\n\n🔗 ${link}`
        };
      }
      return { status: 'error', message: 'Failed to generate payment link. Please try again.' };
    }

    case 'verify_transaction': {
      const rateLimitKey = `verify_limit:${from}`;
      const verifyAttempts = await redisClient.incr(rateLimitKey);
      if (verifyAttempts === 1) await redisClient.expire(rateLimitKey, 300); // 5 mins
      if (verifyAttempts > 3 && !isAdmin && !isStaff) {
          return { status: 'error', code: 'RATE_LIMITED', message: "Too many verification attempts. Abeg wait 5 minutes." };
      }

      const formattedAmount = formatCurrency(args.amount, currency.locale, currency.code);

      if (args.isSuspicious) {
         const reason = args.suspicionReason || "AI detected Photoshop/editing artifacts.";
         console.warn(`🚨 [FRAUD ALERT] AI flagged suspicious receipt from ${from} for ${orgId}. Reason: ${reason}`);
         
         const fraudAlert = `🚨 *FRAUD ALERT: SUSPICIOUS RECEIPT*\n\nA customer (${from}) sent a receipt for *${formattedAmount}* that looks **EDITED** or **FAKE**.\n\n*Reason:* ${reason}\n*Ref:* ${args.reference}\n\nI have blocked this transaction. Please investigate!`;
         
         if (orgConfig?.commandCenterGroupId && (orgConfig.notificationPolicy === 'group_only' || orgConfig.notificationPolicy === 'dual')) {
             await whatsappService.sendText(orgConfig.commandCenterGroupId, fraudAlert);
         }
         if (orgConfig?.adminPhone && (orgConfig.notificationPolicy === 'boss_only' || orgConfig.notificationPolicy === 'dual')) {
             await whatsappService.sendText(orgConfig.adminPhone, fraudAlert);
         }

         return { status: 'failed', code: 'SUSPICIOUS_EDITED', message: "This receipt looks edited. We cannot accept it." };
      }

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
              const diff = Math.abs(args.amount - tx.amount);
              if (diff > 10) {
                  const txFormatted = formatCurrency(tx.amount, currency.locale, currency.code);
                  console.warn(`🛑 [FRAUD ATTEMPT] Amount Mismatch for ${args.reference}. Receipt: ${formattedAmount}, Bank: ${txFormatted}`);
                  return { 
                    status: 'failed', 
                    code: 'AMOUNT_MISMATCH', 
                    message: `Oga, the bank say this reference is for ${txFormatted}, but you say ${formattedAmount}. I no fit accept this!` 
                  };
              }
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

          if (args.purpose === 'refill' && isAdmin) {
              const refillResult = await topupTenant(orgId, args.amount, args.reference);
              if (refillResult) {
                const newBalanceFormatted = formatCurrency(refillResult.newBalance / 100, currency.locale, currency.code);
                return { 
                  status: 'verified', 
                  code: 'REFILL_SUCCESS', 
                  message: `${formattedAmount} verified and credited to your bot! New balance: ${newBalanceFormatted}`,
                  data: verifiedTx 
                };
              }
          }

          if (args.purpose === 'sale') {
              const activity = await getActivityByCustomer(orgId, from);
              if (activity && activity.status === 'pending_payment') {
                  await updateActivity(orgId, activity.id, 'order', { status: 'confirmed' });
                  
                  if (activity.metadata?.cartItems) {
                      await finalizeSale(orgId, activity.metadata.cartItems as { productId: string, quantity: number }[]);
                      console.log(`✅ [STOCK] Finalized sale for Order ${activity.id}. Reserved units converted to physical deduction.`);
                  }
              }

              const successMsg = `💰 *PAYMENT VERIFIED: ${formattedAmount}*\n\nRef: ${args.reference}\nFrom: ${from}\n\n📦 *ACTION:* Start Packaging!`;
              if (orgConfig?.commandCenterGroupId && (orgConfig.notificationPolicy === 'group_only' || orgConfig.notificationPolicy === 'dual')) {
                  await whatsappService.sendText(orgConfig.commandCenterGroupId, successMsg);
              }
              if (orgConfig?.adminPhone && (orgConfig.notificationPolicy === 'boss_only' || orgConfig.notificationPolicy === 'dual')) {
                  await whatsappService.sendText(orgConfig.adminPhone, successMsg);
              }
          }

          return { status: 'verified', data: verifiedTx };
      } else if (orgConfig?.useSmsBridge) {
          await logPendingTransaction(orgId, from, args.amount, args.reference);
          return { status: 'pending', code: 'BRIDGE_AWAIT', message: "Logged. Waiting for bank SMS confirmation." };
      } else {
          const HIGH_VALUE_THRESHOLD = 10000;
          const isHighValue = args.amount >= HIGH_VALUE_THRESHOLD;

          if (isHighValue) {
              console.warn(`🛡️ [VALUE GUARD] High-value receipt (${args.amount}) detected for ${orgId} without bridge.`);
              await logPendingTransaction(orgId, from, args.amount, args.reference);
              await logSystemEvent(orgId, 'HIGH_VALUE_VISION_ATTEMPT', `High-value receipt (${formattedAmount}) from ${from} awaiting manual/bridge confirmation.`, { reference: args.reference });
              
              const alert = `⚠️ *HIGH VALUE RECEIPT*\n\nA customer (${from}) sent a receipt for *${formattedAmount}* (Ref: ${args.reference}).\n\nBecause this is a large amount and you don't have an SMS Bridge, I have *NOT* verified it automatically. Please check your bank and confirm manually!`;
              
              if (orgConfig?.commandCenterGroupId && (orgConfig.notificationPolicy === 'group_only' || orgConfig.notificationPolicy === 'dual')) {
                  await whatsappService.sendText(orgConfig.commandCenterGroupId, alert);
              }
              if (orgConfig?.adminPhone && (orgConfig.notificationPolicy === 'boss_only' || orgConfig.notificationPolicy === 'dual')) {
                  await whatsappService.sendText(orgConfig.adminPhone, alert);
              }

              return { 
                status: 'pending', 
                code: 'HIGH_VALUE_VISION', 
                message: "Receipt seen. Waiting for bank confirmation (usually 2 mins). We will notify you once it drops." 
              };
          }

          await logTransaction(orgId, args.reference, {
              status: 'success',
              amount: args.amount,
              method: 'vision_only',
              extractedBank: args.bankName,
              extractedDate: args.date
          });

          const visionAlert = `👁️ *VISION VERIFICATION*\n\nOga, I have accepted a receipt for *${formattedAmount}* (Ref: ${args.reference}) from ${from}.\n\n*Note:* I verified this using my eyes only (No SMS Bridge).`;
          
          if (orgConfig?.commandCenterGroupId && (orgConfig.notificationPolicy === 'group_only' || orgConfig.notificationPolicy === 'dual')) {
              await whatsappService.sendText(orgConfig.commandCenterGroupId, visionAlert);
          }
          if (orgConfig?.adminPhone && (orgConfig.notificationPolicy === 'boss_only' || orgConfig.notificationPolicy === 'dual')) {
              await whatsappService.sendText(orgConfig.adminPhone, visionAlert);
          }

          return { 
            message: "I have seen your receipt. Thank you! We are processing your order." 
          };
      }
    }

    case 'get_shipping_rates': {
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

      const rateSummary = rates.map(r => `🚚 *${r.provider}* (${r.service}): *${formatCurrency(r.amount, currency.locale, currency.code)}* (${r.deliveryTime})`).join('\n');
      return { status: 'success', data: rates, summary: `📦 *SHIPPING QUOTES:*\n\n${rateSummary}\n\nOga, which one you prefer?` };
    }

    case 'track_shipment': {
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
    }

    case 'add_to_cart': {
      const addResult = await addToCart(
        orgId, 
        from, 
        args.productId, 
        args.quantity || 1
      );
      return addResult.success 
        ? { status: 'success', message: `Added to cart.` } 
        : { status: 'error', message: addResult.message };
    }

    case 'view_cart': {
      const cartData = await getCart(orgId, from);
      if (cartData.items.length === 0) return { status: 'success', message: 'Your cart is empty.', total: 0 };

      const itemList = cartData.items.map(item => `- ${item.name} (x${item.quantity}): ${formatCurrency(item.price, currency.locale, currency.code)}`).join('\n');
      const totalNaira = cartData.totalKobo / 100;
      const formattedTotal = formatCurrency(totalNaira, currency.locale, currency.code);

      return { 
        status: 'success', 
        items: cartData.items, 
        summary: `🛒 *YOUR CART:*\n${itemList}\n\n💰 *Total:* ${formattedTotal}`, 
        totalNaira 
      };
    }

    case 'remove_from_cart': {
      const removeResult = await removeFromCart(
        orgId, from, args.productId, args.quantity
      );
      return removeResult.success 
        ? { status: 'success', message: `Updated cart: ${removeResult.message}` }
        : { status: 'error', message: removeResult.message };
    }

    case 'clear_cart': {
      await clearCart(orgId, from);
      return { status: 'success', message: 'Cart cleared.' };
    }

    case 'book_slot': {
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
    }

    default:
      return null;
  }
}
