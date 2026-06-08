
const crypto = require('crypto');

async function simulateMedia(target, filePath, mimeType) {
    const appSecret = '711ae6c78c19625a35d5e5c6d525fbbb';
    const phoneId = target === 'aelixxr' ? 'baileys-aelixxr' : 'baileys-zynux';
    const from = '2347042310893'; // Boss
    const messageId = `MEDIA-${Date.now()}`;
    
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
                        type: 'image',
                        image: { 
                            id: 'dummy_id',
                            mime_type: mimeType,
                            caption: 'Analyze this receipt Boss'
                        },
                        // The worker MediaInterceptor looks for content.fileName for Baileys
                        // But wait, the webhook ingestion maps message.image.id to content.imageId.
                        // I need to look at how the webhook maps to JobData.
                    }]
                },
                field: 'messages'
            }]
        }]
    };

    // Note: The webhook ingestion in apps/api/src/routes/webhooks.ts line 334:
    // imageId: message.type === 'image' ? message.image?.id : undefined,
    // It doesn't set 'fileName' from the incoming Meta-style webhook.
    // The 'fileName' is only present if it comes from the Sidecar directly.
    // Wait, let me check apps/api/src/routes/webhooks.ts again.
    
    // Actually, I should just trigger a job in the queue directly to test the worker.
    // But the user wants "live" testing. Webhook is live.
}

// Rewriting to trigger queue directly for media test
async function triggerQueueMedia(target, filePath, mimeType) {
    const { Queue } = require('bullmq');
    const Redis = require('ioredis');
    const redis = new Redis('redis://redis:6379');
    const queue = new Queue('whatsapp-queue', { connection: redis });
    
    const jobData = {
      type: 'image',
      orgId: target,
      phoneId: `baileys-${target}`,
      from: '2347042310893',
      name: 'Light Boss',
      messageId: `QUEUE-MEDIA-${Date.now()}`,
      timestamp: Date.now(),
      content: {
        imageId: 'dummy_id',
        fileName: filePath, // THIS triggers the local file read in MediaInterceptor
        caption: 'Zynux, please analyze this inventory asset.',
        mimeType: mimeType
      },
    };

    console.log(`🚀 Triggering direct Queue Media job for ${target}...`);
    await queue.add('process-message', jobData, { removeOnComplete: true });
    console.log(`✅ Job added to queue.`);
    await redis.quit();
}

triggerQueueMedia('zynux', '/app/node_modules/pino/favicon-16x16.png', 'image/png');
