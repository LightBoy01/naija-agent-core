'use server';

import { verifySovereignPin, verifyMfaCode, findOrgByAdminPhone, verifyAdminPin } from '@naija-agent/firebase';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export type AuthState = { error?: string; success?: boolean } | undefined;

/**
 * SOVEREIGN (MASTER) AUTHENTICATION
 */
export async function authenticate(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const phone = formData.get('phone') as string;
  const pin = formData.get('pin') as string;

  if (!phone || !pin) {
    return { error: 'Please enter both phone and PIN.' };
  }

  const isValid = await verifySovereignPin(phone, pin);

  if (isValid) {
    // Stage 1: Success. Skip MFA and set full session for now.
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

/**
 * TENANT (MERCHANT) AUTHENTICATION
 */
export async function tenantAuthenticate(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const phone = formData.get('phone') as string;
  const pin = formData.get('pin') as string;

  if (!phone || !pin) {
    return { error: 'Please enter both phone and PIN.' };
  }

  const org = await findOrgByAdminPhone(phone);
  if (!org) {
    return { error: 'No business found with this phone number.' };
  }

  const isValid = await verifyAdminPin(org.id, pin);

  if (isValid) {
    // Success. Set tenant session (Skip MFA for now per plan).
    (await cookies()).set('tenant_session', JSON.stringify({ orgId: org.id, phone, role: 'boss' }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 86400 * 7, // 1 week persistent session
      path: '/',
    });

    redirect(`/dashboard/${org.id}`);
  } else {
    return { error: 'Invalid PIN. Access denied.' };
  }
}

export async function verifyMfa(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const code = formData.get('code') as string;
  const phone = (await cookies()).get('mfa_pending')?.value;

  if (!phone) {
    redirect('/auth');
  }

  if (!code || code.length !== 6) {
    return { error: 'Please enter a valid 6-digit code.' };
  }

  // Currently MFA is only for Sovereign (naija-agent-master)
  const isValid = await verifyMfaCode('naija-agent-master', code);

  if (isValid) {
    // Stage 2: MFA Success. Set full session.
    (await cookies()).delete('mfa_pending');
    (await cookies()).set('sovereign_session', 'active', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 86400, // 24 hours
      path: '/',
    });

    redirect('/dashboard');
  } else {
    return { error: 'Invalid or expired code. Please try again.' };
  }
}

export async function logout() {
  (await cookies()).delete('sovereign_session');
  redirect('/auth');
}

export async function logoutTenant() {
  (await cookies()).delete('tenant_session');
  redirect('/login');
}
