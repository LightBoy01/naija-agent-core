import { MonnifyProvider } from '@naija-agent/payments';

function createMonnifyClient(): MonnifyProvider | null {
    const keys = process.env.MONNIFY_API_KEY_LOS || process.env.MONNIFY_API_KEY || '';
    const secret = process.env.MONNIFY_SECRET_KEY_LOS || process.env.MONNIFY_SECRET_KEY || '';
    const contract = process.env.MONNIFY_CONTRACT_CODE_LOS || process.env.MONNIFY_CONTRACT_CODE || '';
    if (!keys || !secret) return null;
    return new MonnifyProvider(`${keys}:${secret}:${contract}`);
}

export const monnify = createMonnifyClient();
