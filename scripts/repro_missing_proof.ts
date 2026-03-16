
import { WhatsAppService } from '../apps/worker/src/services/whatsapp';
import axios from 'axios';

// Manual Mock
const originalPost = axios.post;
let interceptedUrl = '';
let interceptedConfig: any = {};

axios.post = async (url: string, data: any, config: any) => {
  interceptedUrl = url;
  interceptedConfig = config || {};
  return { 
    data: { 
      messaging_product: 'whatsapp',
      contacts: [{ input: '1234567890', wa_id: '1234567890' }],
      messages: [{ id: 'msg_123' }] 
    } 
  };
};

async function testMissingProof() {
  const service = new WhatsAppService('mock-token', 'mock-phone-id', 'mock-app-secret');

  try {
    await service.sendText('1234567890', 'Test Message');
    
    console.log('Checking URL params for appsecret_proof...');
    // In axios, params are usually passed in config, but sometimes appended to URL manually.
    // We check both.
    const hasProofInUrl = interceptedUrl.includes('appsecret_proof=');
    const hasProofInParams = interceptedConfig.params && interceptedConfig.params.appsecret_proof;
    
    if (hasProofInUrl || hasProofInParams) {
      console.log('❌ FAIL: appsecret_proof is ALREADY present (Unexpected).');
    } else {
      console.log('✅ PASS: appsecret_proof is MISSING (Confirmed Vulnerability).');
    }
  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
      axios.post = originalPost; // Restore
  }
}

testMissingProof();
