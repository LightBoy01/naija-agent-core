'use server';

import { getDb, addBalance } from '@naija-agent/firebase';
import { revalidatePath } from 'next/cache';
import { verifySovereignSession } from '../../../../lib/auth';

export async function updateOrgStatus(formData: FormData): Promise<void> {
  await verifySovereignSession();
  const orgId = formData.get('orgId') as string;
  const status = formData.get('status') === 'true';
  const type = formData.get('type') as string;

  try {
    const db = getDb();
    const orgRef = db.collection('organizations').doc(orgId);

    if (type === 'bridge') {
      await orgRef.update({
        'config.useSmsBridge': status,
        updatedAt: new Date()
      });
    } else {
      await orgRef.update({
        isActive: status,
        updatedAt: new Date()
      });
    }

    revalidatePath(`/dashboard/organizations/${orgId}`);
    revalidatePath('/dashboard');
  } catch (error: any) {
    console.error('Status Update Error:', error);
  }
}

export async function topUpBalance(formData: FormData): Promise<void> {
  await verifySovereignSession();
  const orgId = formData.get('orgId') as string;
  const amountNaira = parseFloat(formData.get('amount') as string);

  if (isNaN(amountNaira) || amountNaira <= 0) {
    return;
  }

  // Convert to kobo
  const amountKobo = Math.floor(amountNaira * 100);

  try {
    await addBalance(orgId, amountKobo);
    
    revalidatePath(`/dashboard/organizations/${orgId}`);
    revalidatePath('/dashboard');
  } catch (error: any) {
    console.error('Top-Up Error:', error);
  }
}
