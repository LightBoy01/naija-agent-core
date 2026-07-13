import { PocketFiProvider } from '@naija-agent/payments';

function createPocketFiClient(): PocketFiProvider | null {
    const secret = process.env.POCKETFI_SECRET_KEY || '';
    const businessId = process.env.POCKETFI_BUSINESS_ID || '';
    
    if (!secret || !businessId) return null;
    
    // We pass isLive = true if NODE_ENV is production, else false for test environment
    const isLive = process.env.NODE_ENV === 'production';
    return new PocketFiProvider(secret, businessId, isLive);
}

export const pocketfi = createPocketFiClient();
