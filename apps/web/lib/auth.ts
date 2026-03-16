import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export interface TenantSession {
  orgId: string;
  phone: string;
  role: 'boss' | 'staff';
}

/**
 * Verifies if the current requester is the Sovereign (Platform Owner).
 * Throws an error if unauthorized.
 */
export async function verifySovereignSession() {
  const session = (await cookies()).get('sovereign_session');
  
  if (!session || session.value !== 'active') {
    throw new Error('UNAUTHORIZED: Sovereign session required.');
  }
}

/**
 * Verifies if the current requester has a valid session for the requested Organization.
 * Redirects or throws if invalid.
 */
export async function verifyTenantSession(requestedOrgId?: string): Promise<TenantSession> {
  const cookie = (await cookies()).get('tenant_session');
  
  if (!cookie) {
    redirect('/login');
  }

  try {
    const session = JSON.parse(cookie.value) as TenantSession;
    
    // Security: If a specific orgId is requested, ensure the session matches
    if (requestedOrgId && session.orgId !== requestedOrgId) {
       console.error(`🛡️ [AUTH] Tenant ID mismatch: Session=${session.orgId}, Request=${requestedOrgId}`);
       throw new Error('UNAUTHORIZED: Tenant ID mismatch.');
    }
    
    return session;
  } catch {
    redirect('/login');
  }
}
