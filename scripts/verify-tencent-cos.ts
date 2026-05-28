import { TencentCOSProvider } from '../packages/storage/src/providers/tencent.js';
import dotenv from 'dotenv';

dotenv.config();

async function verifyTencentCOS() {
    console.log('📦 --- TENCENT COS DEEP AUDIT --- 📦');

    const config = {
        secretId: process.env.TENCENT_COS_SECRET_ID || '',
        secretKey: process.env.TENCENT_COS_SECRET_KEY || '',
        bucket: process.env.TENCENT_COS_BUCKET || '',
        region: process.env.TENCENT_COS_REGION || 'ap-singapore',
        accelerate: process.env.TENCENT_COS_ACCELERATE === 'true'
    };

    if (!config.secretId || !config.secretKey || !config.bucket) {
        console.error('❌ Missing Tencent COS configuration in .env');
        return;
    }

    const provider = new TencentCOSProvider(config);
    const testBuffer = Buffer.from('Tencent COS Audit - ' + new Date().toISOString());
    const testFileName = 'audit-test-' + Date.now() + '.txt';
    const orgId = 'audit-org';

    try {
        // 1. Upload Test
        console.log(`📤 Testing Upload to ${config.bucket}...`);
        const url = await provider.upload(orgId, testFileName, testBuffer, 'text/plain', {
            purpose: 'audit',
            environment: 'termux'
        });
        console.log(`✅ Upload Successful!`);
        console.log(`📍 Public URL: ${url}`);

        if (config.accelerate && !url.includes('accelerate')) {
            console.warn('⚠️ Acceleration domain MISSING from URL despite being enabled in config.');
        } else if (config.accelerate) {
            console.log('✅ Acceleration domain detected in URL.');
        }

        // 2. Signed URL Test
        console.log('🔑 Testing Signed URL generation...');
        const signedUrl = await provider.getSignedUrl(url);
        console.log(`✅ Signed URL Generated: ${signedUrl.split('?')[0]}...`);
        
        if (signedUrl.includes('q-sign-algorithm')) {
            console.log('✅ Signature parameters detected.');
        } else {
            console.error('❌ Signature parameters MISSING from signed URL.');
        }

        // 3. Acceleration Domain Consistency
        if (config.accelerate && !signedUrl.includes('accelerate')) {
             console.error('❌ Signed URL failed to use acceleration domain.');
        }

    } catch (e: any) {
        console.error(`❌ COS Audit Failed: ${e.message}`);
    }
}

verifyTencentCOS();
