
const crypto = require('crypto');

async function simulateMessage(target, text) {
    const appSecret = '711ae6c78c19625a35d5e5c6d525fbbb';
    const phoneId = target === 'aelixxr' ? '2347072139935' : '2347011925076';
    const from = '2347042310893'; // Boss
    const messageId = `TEST-${Date.now()}`;
    
    const payload = {
        object: 'whatsapp_business_account',
        entry: [{
            id: '123',
            changes: [{
                value: {
                    messaging_product: 'whatsapp',
                    metadata: { display_phone_number: '123', phone_number_id: phoneId },
                    contacts: [{ profile: { name: 'Light Boss' }, wa_id: from }],
                    messages: [{
                        from: from,
                        id: messageId,
                        timestamp: Math.floor(Date.now() / 1000).toString(),
                        type: 'text',
                        text: { body: text }
                    }]
                },
                field: 'messages'
            }]
        }]
    };

    const rawBody = JSON.stringify(payload);
    const signature = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

    console.log(`🚀 Simulating message to ${target}: "${text}"`);
    
    try {
        const response = await fetch('http://localhost:3000/webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Hub-Signature-256': signature
            },
            body: rawBody
        });
        
        const status = response.status;
        const body = await response.text();
        console.log(`✅ Webhook Response (${status}): ${body}`);
    } catch (err) {
        console.error(`❌ Simulation Failed:`, err.message);
    }
}

async function runTests() {
    // 1. Test Aelixxr (Life OS)
    await simulateMessage('aelixxr', 'Hey Aelixxr, tell me a short summary of my life goals based on our history.');
    
    // 2. Test Zynux (Business OS)
    await simulateMessage('zynux', 'Zynux, what is our current Indomie price?');
}

runTests();
