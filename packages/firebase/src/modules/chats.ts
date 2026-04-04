import { 
  getFirestore, 
  FieldValue, 
  Timestamp 
} from 'firebase-admin/firestore';
import { Message } from '@naija-agent/types';

const db = getFirestore();
const chatsRef = db.collection('chats');

export async function findOrCreateChat(orgId: string, userPhone: string, userName: string): Promise<string> {
  const chatId = `${orgId}_${userPhone}`;
  const chatRef = chatsRef.doc(chatId);
  
  const doc = await chatRef.get();
  if (!doc.exists) {
    await chatRef.set({
      organizationId: orgId,
      whatsappUserId: userPhone,
      userName,
      isOptedOut: false,
      isCartActive: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  
  return chatId;
}

export async function saveMessage(chatId: string, message: Omit<Message, 'timestamp'>) {
  const chatRef = chatsRef.doc(chatId);
  await chatRef.collection('messages').add({
    ...message,
    timestamp: FieldValue.serverTimestamp(),
  });
  
  await chatRef.set({
    lastMessageAt: FieldValue.serverTimestamp(),
    summary: message.content.substring(0, 50) + '...',
  }, { merge: true });
}

export async function getChatHistory(chatId: string, limit = 10): Promise<Message[]> {
  const snapshot = await chatsRef.doc(chatId).collection('messages')
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
    
  return snapshot.docs.map(doc => doc.data() as Message).reverse();
}

export async function setOptOut(orgId: string, userPhone: string, status: boolean): Promise<void> {
  const chatId = `${orgId}_${userPhone}`;
  const chatRef = chatsRef.doc(chatId);
  await chatRef.set({ isOptedOut: status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function checkOptOut(orgId: string, userPhone: string): Promise<boolean> {
  const chatId = `${orgId}_${userPhone}`;
  const chatRef = chatsRef.doc(chatId);
  const doc = await chatRef.get();
  return doc.exists ? (doc.data()?.isOptedOut || false) : false;
}

export async function getAbandonedCarts(maxAgeMinutes: number = 120, minAgeMinutes: number = 30) {
  const now = Date.now();
  const minAgeTime = now - (minAgeMinutes * 60 * 1000);
  const maxAgeTime = now - (maxAgeMinutes * 60 * 1000);
  
  // Convert timestamps for Firestore query
  const minDate = new Date(minAgeTime); 
  const maxDate = new Date(maxAgeTime); 

  // Query: Carts active between minAge (e.g. 30m ago) and maxAge (e.g. 2h ago)
  // Logic: Updated <= 30 mins ago AND >= 2 hours ago
  const snapshot = await db.collection('chats')
    .where('isCartActive', '==', true)
    .where('lastCartUpdateAt', '<=', Timestamp.fromDate(minDate))
    .where('lastCartUpdateAt', '>=', Timestamp.fromDate(maxDate))
    .get();

  const abandoned: { orgId: string, userPhone: string, chatId: string }[] = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    const lastNudge = data.lastNudgeAt ? (data.lastNudgeAt as Timestamp).toMillis() : 0;
    
    // Nudge Cooldown: Don't nudge if nudged in last 24 hours
    if (now - lastNudge > 24 * 60 * 60 * 1000) {
       abandoned.push({
         orgId: data.organizationId,
         userPhone: data.whatsappUserId,
         chatId: doc.id
       });
    }
  });

  return abandoned;
}

export async function markCartNudged(chatId: string) {
  await chatsRef.doc(chatId).update({
    lastNudgeAt: FieldValue.serverTimestamp()
  });
}

export async function addToCart(
  orgId: string, 
  userPhone: string, 
  productId: string, 
  quantity: number
): Promise<{ success: boolean; message: string }> {
  const orgsRef = db.collection('organizations');
  const productRef = orgsRef.doc(orgId).collection('products').doc(productId);
  const chatId = `${orgId}_${userPhone}`;
  const cartItemRef = chatsRef.doc(chatId).collection('cart').doc(productId);

  try {
    return await db.runTransaction(async (t) => {
      // 1. Read Product and Cart Item
      const productDoc = await t.get(productRef);
      if (!productDoc.exists) return { success: false, message: 'PRODUCT_NOT_FOUND' };
      
      const productData = productDoc.data();
      const currentStock = productData?.stock ?? 0;
      const currentReserved = productData?.reserved ?? 0;
      const available = currentStock - currentReserved;

      // 🛡️ [STOCK LOCK]: Check against available (stock - reserved)
      if (available < quantity) {
        return { success: false, message: `INSUFFICIENT_STOCK: Only ${available} available.` };
      }

      const cartDoc = await t.get(cartItemRef);
      const currentCartQty = cartDoc.exists ? cartDoc.data()?.quantity || 0 : 0;

      // 2. Reserve Stock on Product
      t.update(productRef, {
        reserved: FieldValue.increment(quantity),
        updatedAt: FieldValue.serverTimestamp()
      });

      // 3. Add to Cart with Reservation Timestamp
      t.set(cartItemRef, {
        productId,
        name: productData?.name,
        price: productData?.price, 
        quantity: currentCartQty + quantity,
        addedAt: FieldValue.serverTimestamp(),
        reservedAt: FieldValue.serverTimestamp() // Track for cleanup
      }, { merge: true });

      // 4. Update Chat State
      t.update(chatsRef.doc(chatId), {
        isCartActive: true,
        lastCartUpdateAt: FieldValue.serverTimestamp()
      });

      return { success: true, message: 'ADDED' };
    });
  } catch (e: any) {
    console.error('Add to Cart Error:', e.message);
    return { success: false, message: e.message };
  }
}

export async function removeFromCart(
  orgId: string, 
  userPhone: string, 
  productId: string, 
  quantity?: number
): Promise<{ success: boolean; message: string }> {
  const chatId = `${orgId}_${userPhone}`;
  const chatRef = chatsRef.doc(chatId);
  const cartItemRef = chatRef.collection('cart').doc(productId);
  const productRef = db.collection('organizations').doc(orgId).collection('products').doc(productId);

  try {
    return await db.runTransaction(async (t) => {
      const cartDoc = await t.get(cartItemRef);
      if (!cartDoc.exists) return { success: false, message: 'ITEM_NOT_IN_CART' };

      const currentQty = cartDoc.data()?.quantity || 0;

      if (!quantity || currentQty <= quantity) {
        t.delete(cartItemRef);
        
        t.update(productRef, {
            reserved: FieldValue.increment(-currentQty),
            updatedAt: FieldValue.serverTimestamp()
        });

        const remainingItemsSnapshot = await chatRef.collection('cart').limit(1).get();
        if (remainingItemsSnapshot.empty) {
          t.update(chatRef, { isCartActive: false });
        }

        return { success: true, message: 'REMOVED_ENTIRELY' };
      } else {
        t.update(cartItemRef, { 
          quantity: currentQty - quantity,
          updatedAt: FieldValue.serverTimestamp()
        });

        t.update(productRef, {
            reserved: FieldValue.increment(-quantity),
            updatedAt: FieldValue.serverTimestamp()
        });

        t.update(chatRef, { lastCartUpdateAt: FieldValue.serverTimestamp() });
        return { success: true, message: 'QUANTITY_REDUCED' };
      }
    });
  } catch (e: any) {
    console.error('Remove from Cart Error:', e.message);
    return { success: false, message: e.message };
  }
}

export async function getCart(orgId: string, userPhone: string): Promise<{ items: any[], totalKobo: number }> {
  const cartSnapshot = await chatsRef.doc(`${orgId}_${userPhone}`).collection('cart').get();
  
  let totalKobo = 0;
  const items: any[] = [];

  cartSnapshot.forEach(doc => {
    const data = doc.data();
    const itemTotal = (data.price || 0) * (data.quantity || 0) * 100;
    totalKobo += itemTotal;
    items.push({ id: doc.id, ...data });
  });

  return { items, totalKobo };
}

export async function clearCart(orgId: string, userPhone: string): Promise<void> {
  const chatId = `${orgId}_${userPhone}`;
  const chatRef = chatsRef.doc(chatId);
  const cartRef = chatRef.collection('cart');
  const snapshot = await cartRef.get();
  
  const batch = db.batch();
  
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const qty = data.quantity || 0;
    const productId = doc.id;
    
    const productRef = db.collection('organizations').doc(orgId).collection('products').doc(productId);
    batch.update(productRef, {
      reserved: FieldValue.increment(-qty),
      updatedAt: FieldValue.serverTimestamp()
    });

    batch.delete(doc.ref);
  });
  
  batch.update(chatRef, { isCartActive: false, lastCartUpdateAt: FieldValue.serverTimestamp() });
  
  await batch.commit();
}

export async function getExpiredCarts(maxAgeMinutes: number = 120): Promise<{ orgId: string, userPhone: string, chatId: string }[]> {
  const maxAgeTime = Date.now() - (maxAgeMinutes * 60 * 1000);
  const maxDate = new Date(maxAgeTime); 

  const snapshot = await db.collection('chats')
    .where('isCartActive', '==', true)
    .where('lastCartUpdateAt', '<=', Timestamp.fromDate(maxDate))
    .get();

  const expired: { orgId: string, userPhone: string, chatId: string }[] = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    expired.push({
      orgId: data.organizationId,
      userPhone: data.whatsappUserId,
      chatId: doc.id
    });
  });

  return expired;
}

export async function getOrgChats(orgId: string, limit = 20): Promise<any[]> {
  const snapshot = await chatsRef
    .where('organizationId', '==', orgId)
    .orderBy('lastMessageAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

export async function getNetworkChats(orgId: string, limit = 20): Promise<any[]> {
  if (orgId !== 'naija-agent-master') {
    throw new Error('UNAUTHORIZED_GLOBAL_QUERY');
  }

  const snapshot = await chatsRef
    .orderBy('lastMessageAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}
