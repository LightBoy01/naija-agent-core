import { 
  getFirestore, 
  FieldValue, 
  Timestamp 
} from 'firebase-admin/firestore';
import { StaffData, Activity } from '@naija-agent/types';

const db = getFirestore();
const orgsRef = db.collection('organizations');

/**
 * Authorizes a staff member (Rider, Assistant, etc.) for an organization.
 */
export async function authorizeStaff(orgId: string, phone: string, name: string, role: string): Promise<void> {
  await orgsRef.doc(orgId).collection('staff').doc(phone).set({
    phone,
    name,
    role,
    isActive: true,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Checks if a phone number is an authorized staff member for an organization.
 */
export async function getStaff(orgId: string, phone: string): Promise<StaffData | null> {
  const doc = await orgsRef.doc(orgId).collection('staff').doc(phone).get();
  return doc.exists ? doc.data() as StaffData : null;
}

/**
 * Deactivates a staff member.
 */
export async function deactivateStaff(orgId: string, phone: string): Promise<void> {
  await orgsRef.doc(orgId).collection('staff').doc(phone).update({
    isActive: false,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Creates or updates a business activity with full State Management.
 */
export async function updateActivity(
  orgId: string, 
  activityId: string, 
  type: string, 
  data: any
): Promise<void> {
  await orgsRef.doc(orgId).collection('activities').doc(activityId).set({
    type,
    status: data.status || 'pending',
    summary: data.summary,
    amount: data.amount || null,
    customerPhone: data.customerPhone || null,
    assignedStaffPhone: data.assignedStaffPhone || null,
    metadata: data.metadata || {},
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

/**
 * Fetches the most recent activity for a customer to support order tracking.
 */
export async function getActivityByCustomer(orgId: string, phone: string): Promise<Activity | null> {
  const activities = await getActivitiesByCustomer(orgId, phone, 1);
  return activities[0] || null;
}

/**
 * Fetches a list of recent activities for a customer.
 */
export async function getActivitiesByCustomer(orgId: string, phone: string, limit = 5): Promise<Activity[]> {
  const snapshot = await orgsRef.doc(orgId).collection('activities')
    .where('customerPhone', '==', phone)
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity));
}

/**
 * Fetches the last N activities for the entire organization (Manager Only).
 */
export async function getRecentActivities(orgId: string, limit = 10): Promise<Activity[]> {
  const snapshot = await orgsRef.doc(orgId).collection('activities')
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity));
}

/**
 * Fetches a single activity by ID.
 */
export async function getActivityById(orgId: string, activityId: string): Promise<Activity | null> {
  const doc = await orgsRef.doc(orgId).collection('activities').doc(activityId).get();
  return doc.exists ? ({ id: doc.id, ...doc.data() } as Activity) : null;
}

/**
 * GARBAGE COLLECTION (Phase 7.2): Releases stock from expired pending_payment orders.
 * This should be run hourly or during low-stock checks.
 */
export async function releaseExpiredReservations(orgId: string): Promise<number> {
  const now = Date.now();
  const expiredOrders = await orgsRef.doc(orgId).collection('activities')
    .where('status', '==', 'pending_payment')
    .where('metadata.expiresAt', '<=', now)
    .get();

  if (expiredOrders.empty) return 0;

  let releasedCount = 0;
  // Note: Circular dependency risk if we import releaseStock here.
  // Best to move releaseStock to a shared location or keep it in products.
  // For now, assuming releaseStock is available via index re-export or direct import.
  const { releaseStock } = await import('./products.js'); 

  for (const orderDoc of expiredOrders.docs) {
    const data = orderDoc.data();
    if (data.metadata?.cartItems) {
      await releaseStock(orgId, data.metadata.cartItems);
      await orderDoc.ref.update({ status: 'cancelled', 'metadata.cancelReason': 'EXPIRED_RESERVATION' });
      releasedCount++;
    }
  }
  return releasedCount;
}

/**
 * Atomically books a time slot for a service (Appointment/Booking).
 * Throws an error if the slot is already taken.
 */
export async function bookSlot(
  orgId: string, 
  activityId: string, 
  data: { 
    startTime: string; // ISO String 
    durationMinutes?: number;
    summary: string;
    customerPhone: string;
  }
): Promise<void> {
  const activitiesRef = orgsRef.doc(orgId).collection('activities');
  
  await db.runTransaction(async (t) => {
    const conflictQuery = activitiesRef
      .where('metadata.startTime', '==', data.startTime)
      .where('status', 'in', ['confirmed', 'booked'])
      .limit(1);
      
    const conflictSnap = await t.get(conflictQuery);
    
    if (!conflictSnap.empty) {
      throw new Error('SLOT_TAKEN');
    }

    const newDocRef = activitiesRef.doc(activityId);
    t.set(newDocRef, {
      type: 'booking',
      status: 'confirmed', // Assuming pre-payment or instant booking logic
      summary: data.summary,
      customerPhone: data.customerPhone,
      metadata: {
        startTime: data.startTime,
        duration: data.durationMinutes || 60,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Fetches sales and activity summary for a specific date (YYYY-MM-DD).
 */
export async function getUpcomingBookingsForReminders(orgId: string, minInFuture: number, maxInFuture: number): Promise<any[]> {
  const now = new Date();
  
  const startTime = new Date(now.getTime() + minInFuture * 60000);
  const endTime = new Date(now.getTime() + maxInFuture * 60000);

  const snapshot = await orgsRef.doc(orgId).collection('activities')
    .where('type', '==', 'booking')
    .where('status', '==', 'confirmed')
    .where('metadata.startTime', '>=', startTime.toISOString())
    .where('metadata.startTime', '<=', endTime.toISOString())
    .get();

  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as any))
    .filter(b => !b.metadata?.reminderSentAt);
}

export async function cancelBooking(orgId: string, bookingId: string, performedBy = 'system'): Promise<any | null> {
  const docRef = orgsRef.doc(orgId).collection('activities').doc(bookingId);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  await docRef.update({
    status: 'cancelled',
    'metadata.cancelledBy': performedBy,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: doc.id, ...doc.data() };
}

/**
 * Marks a booking as having had a reminder sent.
 */
export async function markReminderSent(orgId: string, activityId: string): Promise<void> {
  await orgsRef.doc(orgId).collection('activities').doc(activityId).update({
    'metadata.reminderSentAt': FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
}
