'use server';

import { getDb as getFirebase } from '@naija-agent/firebase';
import { topupOrg } from '@naija-agent/database';
import { revalidatePath } from 'next/cache';
import { verifySovereignSession } from '../../../../lib/auth';

export async function updateOrgStatus(formData: FormData): Promise<void> {
  await verifySovereignSession();
  const orgId = formData.get('orgId') as string;
  const status = formData.get('status') === 'true';

  try {
    const db = getFirebase();
    const orgRef = db.collection('organizations').doc(orgId);

    await orgRef.update({
      isActive: status,
      updatedAt: new Date()
    });

    revalidatePath(`/dashboard/organizations/${orgId}`);
    revalidatePath('/dashboard');
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Status Update Error:', err);
  }
}

export async function topUpBalance(formData: FormData): Promise<void> {
  await verifySovereignSession();
  const orgId = formData.get('orgId') as string;
  const amountNaira = parseFloat(formData.get('amount') as string);

  if (isNaN(amountNaira) || amountNaira <= 0) {
    return;
  }

  try {
    // topupOrg handles conversion to Kobo and idempotency internally
    const reference = `MANUAL_${orgId}_${Date.now()}`;
    await topupOrg(orgId, amountNaira, reference);
    
    revalidatePath(`/dashboard/organizations/${orgId}`);
    revalidatePath('/dashboard');
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Top-Up Error:', err);
  }
}
