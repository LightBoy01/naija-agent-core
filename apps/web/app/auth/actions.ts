'use server';

import { verifySovereignPin } from '@naija-agent/firebase';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export type AuthState = { error: string } | undefined;

export async function authenticate(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const phone = formData.get('phone') as string;
  const pin = formData.get('pin') as string;

  if (!phone || !pin) {
    return { error: 'Please enter both phone and PIN.' };
  }

  const isValid = await verifySovereignPin(phone, pin);

  if (isValid) {
    // Set a secure HTTP-only session cookie for 24 hours
    (await cookies()).set('sovereign_session', 'active', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 86400, // 24 hours
      path: '/',
    });

    redirect('/dashboard');
  } else {
    return { error: 'Invalid phone or PIN. Access denied.' };
  }
}

export async function logout() {
  (await cookies()).delete('sovereign_session');
  redirect('/auth');
}
