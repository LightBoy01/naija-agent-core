import { Type } from '@google/genai';
import { HandlerContext } from './definitions.js';

export const COMMERCE_TOOLS = [
  {
    name: "get_payment_instructions",
    description: "Returns bank account details for payments (Sales or AI Credit Refills).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        purpose: { type: Type.STRING, format: "enum", enum: ['sale', 'refill'], description: "Purpose: 'sale' (paying the Boss) or 'refill' (buying AI credits from the Sovereign)." }
      },
      required: ["purpose"]
    }
  },
  {
    name: "generate_refill_link",
    description: "Generates a secure Paystack payment link for the Boss to buy AI credits.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        amount: { type: Type.NUMBER, description: `Amount in Naira (min 2000)` }
      },
      required: ["amount"]
    }
  },
  {
    name: "verify_transaction",
    description: "Verifies a bank transaction with the payment provider.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reference: { type: Type.STRING, description: "Transaction Reference or Session ID" },
        amount: { type: Type.NUMBER, description: `Amount in Naira` },
        bankName: { type: Type.STRING, description: "Name of the sending bank" },
        date: { type: Type.STRING, description: "Transaction date/time" },
        purpose: { type: Type.STRING, format: "enum", enum: ['sale', 'refill'], description: "Context of the payment: 'sale' for customers, 'refill' for Boss topping up AI credits." },
        isSuspicious: { type: Type.BOOLEAN, description: "Set to true if you detect ANY Photoshop or editing artifacts in the image." },
        suspicionReason: { type: Type.STRING, description: "If suspicious, describe exactly what looks fake (e.g., font mismatch, blurred digits)." }
      },
      required: ["reference", "amount", "purpose"]
    }
  },
  {
    name: "collect_customer_feedback",
    description: "Collects a rating and feedback comment from a customer.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        rating: { type: Type.NUMBER, description: "Rating from 1 to 5" },
        comment: { type: Type.STRING, description: "Customer's detailed feedback comment" }
      },
      required: ["rating", "comment"]
    }
  }
];

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
import { syncCartState, getDb, fraudRegistry, eq, sql, and } from '@naija-agent/database';
import crypto from 'crypto';
import { formatCurrency } from '../utils/currency.js';

export async function handleCommerceTools(name: string, args: any, ctx: HandlerContext): Promise<any> {
  const { orgId, from, isStaff, isAdmin, whatsappService, paymentProvider, redisClient, orgConfig, currency } = ctx;

  switch (name) {
    case 'get_payment_instructions':
      if (args.purpose === 'refill') {
        const bank = orgConfig?.sovereignBankDetails;
        if (!bank) return { status: 'error', message: 'Sovereign bank details not configured. Please contact support.' };
        const refillMsg = `🏦 *SOVEREIGN REFILL INSTRUCTIONS*\n\n1. Transfer the amount to:\n   - Bank: ${bank.bankName}\n   - Account: ${bank.accountNumber}\n   - Name: ${bank.accountName}\n\n2. Snap the receipt and send it here.\n3. I will credit your AI wallet instantly!`;
        return { status: 'success', purpose: 'refill', message: refillMsg, details: bank };
      } else {
        const bank = orgConfig?.bankDetails;
        if (!bank) return { status: 'error', message: 'Business bank details not configured. Please ask the Boss.' };
        const saleMsg = `🏦 *PAYMENT INSTRUCTIONS*\n\nOga, abeg pay into this account:\n   - Bank: ${bank.bankName}\n   - Account: ${bank.accountNumber}\n   - Name: ${bank.accountName}\n\nOnce you pay, send the receipt here and I will start packaging your order!`;
        return { status: 'success', purpose: 'sale', message: saleMsg, details: bank };
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
      await syncCartState(`${orgId}_${from}`, false);

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
      
      const email = `${orgId}@naijaagent.core`; 
      const formattedAmount = formatCurrency(args.amount, currency.locale, currency.code);
      const bank = orgConfig?.sovereignBankDetails;

      let link = null;
      if (paymentProvider) {
        try {
          link = await paymentProvider.createPaymentLink(orgId, email, args.amount);
        } catch (e: any) {
          console.error('❌ [REFILL] Paystack link generation failed:', e.message);
        }
      }

      if (link) {
        return { 
          status: 'success', 
          link, 
          bank,
          message: `Oga, here is your secure Paystack link to buy ${formattedAmount} credit. Once you pay, I will credit your bot instantly!\n\n🔗 ${link}\n\n*Bank Fallback:* If the link no work, abeg transfer to ${bank?.bankName || 'Sovereign Bank'} (${bank?.accountNumber || 'N/A'}).`
        };
      }

      if (bank) {
        return {
          status: 'success',
          purpose: 'refill_fallback',
          bank,
          message: `Oga, Paystack is currently down. Abeg use direct bank transfer for your ${formattedAmount} refill:\n\n🏦 *Bank:* ${bank.bankName}\n🔢 *Account:* ${bank.accountNumber}\n👤 *Name:* ${bank.accountName}\n\nSend me the receipt once you're done!`
        };
      }

      return { status: 'error', message: 'Failed to generate payment options. Please contact Sovereign Support.' };
    }

    case 'verify_transaction': {
      const rateLimitKey = `verify_limit:${from}`;
      const verifyAttempts = await redisClient.incr(rateLimitKey);
      if (verifyAttempts === 1) await redisClient.expire(rateLimitKey, 300); // 5 mins
      if (verifyAttempts > 3 && !isAdmin && !isStaff) {
          return { status: 'error', code: 'RATE_LIMITED', message: "Too many verification attempts. Abeg wait 5 minutes." };
      }

      // --- SCAM-SHIELD (PHASE 9.3) ---
      const phoneHash = crypto.createHash('sha256').update(from).digest('hex');
      const db = getDb();
      
      // Check reports from OTHER organizations to determine network-wide risk
      const fraudFlags = await db.select()
        .from(fraudRegistry)
        .where(and(
            eq(fraudRegistry.phoneHash, phoneHash),
            sql`${fraudRegistry.orgId} != ${orgId}`
        ));
      
      if (fraudFlags.length > 0) {
          const uniqueReportingOrgs = new Set(fraudFlags.map(f => f.orgId)).size;
          const consensusMet = uniqueReportingOrgs >= 2;
          const warning = consensusMet 
            ? `🚨 *NETWORK ALERT:* This customer has been flagged by ${uniqueReportingOrgs} different businesses for fraud!`
            : `⚠️ *FRAUD WARNING:* This customer has a suspicious report from another business in our network.`;
          
          console.warn(`🛡️ [SCAM-SHIELD] Flagged user ${from} attempting transaction for ${orgId}. uniqueOrgs: ${uniqueReportingOrgs}`);
          
          if (isAdmin || isStaff) {
             // Managers get the technical warning
             return { status: 'warning', code: 'SCAM_SHIELD_FLAG', message: `${warning}\n\nOga, use your eye check am well before you accept.`, data: fraudFlags };
          } else {
             // Customers get a slightly delayed response to discourage automated testing
             await new Promise(r => setTimeout(r, 2000));
          }
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
      if (addResult.success) {
        await syncCartState(`${orgId}_${from}`, true);
      }
      return addResult.success 
        ? { status: 'success', message: `Added to cart.` } 
        : { status: 'error', message: addResult.message };
    }

    case 'view_cart': {
      const cartData = await getCart(orgId, from);
      if (cartData.items.length === 0) {
        await syncCartState(`${orgId}_${from}`, false);
        return { status: 'success', message: 'Your cart is empty.', total: 0 };
      }

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
      
      const cart = await getCart(orgId, from);
      await syncCartState(`${orgId}_${from}`, cart.items.length > 0);

      return removeResult.success 
        ? { status: 'success', message: `Updated cart: ${removeResult.message}` }
        : { status: 'error', message: removeResult.message };
    }

    case 'clear_cart': {
      await clearCart(orgId, from);
      await syncCartState(`${orgId}_${from}`, false);
      return { status: 'success', message: 'Cart cleared.' };
    }

    case 'generate_checkout_invoice': {
      const cart = await getCart(orgId, from);
      if (cart.items.length === 0) return { status: 'error', message: 'Your cart is empty. Please add items first.' };

      const totalNaira = cart.totalKobo / 100;
      const formattedTotal = formatCurrency(totalNaira, currency.locale, currency.code);
      const invoiceId = `INV-${Date.now().toString().slice(-6)}`;
      const itemList = cart.items.map(i => `- ${i.name} (x${i.quantity}): ${formatCurrency(i.price, currency.locale, currency.code)}`).join('\n');

      let paymentSection = "";
      let paymentLink = null;

      // 1. Try Payment Gateway (Paystack/Monnify)
      if (paymentProvider) {
        try {
           const email = `${from.replace('+', '')}@naija-agent.user`; // Pseudo-email for guest checkout
           paymentLink = await paymentProvider.createPaymentLink(orgId, email, totalNaira);
           paymentSection = `💳 *PAY WITH CARD/TRANSFER:*\n👉 [Click to Pay Securely](${paymentLink})`;
        } catch (e: any) {
           console.error('Payment Link Error:', e.message);
        }
      }

      // 2. Fallback to Bank Transfer
      if (!paymentLink) {
         const bank = orgConfig?.bankDetails;
         if (!bank) return { status: 'error', message: 'Bank details not set. Please ask the Boss.' };
         paymentSection = `🏦 *BANK TRANSFER:*\n\nBank: ${bank.bankName}\nAccount: ${bank.accountNumber}\nName: ${bank.accountName}\n\n*Ref:* ${invoiceId}`;
      }

      const invoiceMsg = `🧾 *INVOICE: ${invoiceId}*\n\n` +
        `🛒 *Items:*\n${itemList}\n\n` +
        `💰 *TOTAL TO PAY: ${formattedTotal}*\n\n` +
        `------------------------------\n` +
        `${paymentSection}\n` +
        `------------------------------\n` +
        `⏳ *Stock Reserved for 15 minutes.*`;

      return { status: 'success', invoice: invoiceMsg, paymentLink, total: totalNaira, invoiceId };
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

    case 'collect_customer_feedback': {
      const { rating, comment } = args;
      if (rating < 1 || rating > 5) {
        return { status: 'error', message: 'Rating must be between 1 and 5.' };
      }
      
      await logSystemEvent(orgId, 'CUSTOMER_FEEDBACK', `Rating: ${rating}/5. Comment: ${comment}`, {
        customerPhone: from,
        rating,
        comment
      });
      
      const responseMsg = rating >= 4 
        ? "Thank you so much for the excellent rating! We are glad you enjoyed our service. 🌟\n\n_P.S. Impressed by this chat? Get a smart AI assistant like me for your own business! Chat with my Masterbot here: wa.me/2347011925076_" 
        : "Thank you for the feedback. We will use this to improve our service! 🙏";
        
      return { status: 'success', message: responseMsg };
    }

    default:
      return null;
  }
}
