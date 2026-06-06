import { eq, and, desc } from 'drizzle-orm';
import { db } from './db.js';
import { activities } from './schema.js';

export async function updateActivity(orgId: string, activityId: string, type: string, data: any): Promise<void> {
  await db!.insert(activities).values({
    id: activityId,
    orgId,
    type,
    status: data.status || 'pending',
    summary: data.summary,
    amount: data.amount ? String(data.amount) : null,
    customerPhone: data.customerPhone,
    assignedStaffPhone: data.assignedStaffPhone,
    metadata: data.metadata || {},
    updatedAt: new Date()
  }).onConflictDoUpdate({
    target: activities.id,
    set: {
      status: data.status || 'pending',
      summary: data.summary,
      amount: data.amount ? String(data.amount) : null,
      customerPhone: data.customerPhone,
      assignedStaffPhone: data.assignedStaffPhone,
      metadata: data.metadata || {},
      updatedAt: new Date()
    }
  });
}

export async function getActivityById(orgId: string, activityId: string) {
  const res = await db!.select().from(activities).where(and(eq(activities.id, activityId), eq(activities.orgId, orgId))).limit(1);
  return res[0] || null;
}

export async function getRecentActivities(orgId: string, limit = 10) {
  return await db!.select().from(activities)
    .where(eq(activities.orgId, orgId))
    .orderBy(desc(activities.updatedAt))
    .limit(limit);
}

export async function getActivityByCustomer(orgId: string, phone: string) {
  const res = await db!.select().from(activities)
    .where(and(eq(activities.orgId, orgId), eq(activities.customerPhone, phone)))
    .orderBy(desc(activities.updatedAt))
    .limit(1);
  return res[0] || null;
}
