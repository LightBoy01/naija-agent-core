import { cookies } from 'next/headers';

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
