import { handleInventoryTools } from './apps/worker/src/tools/inventory.js';

async function runTest() {
    console.log('--- Testing send_product_image tool ---');
    
    let sentImageUrl = '';
    let sentCaption = '';
    let sentTo = '';

    const mockCtx: any = {
        orgId: 'test-org',
        from: '1234567890',
        whatsappService: {
            sendImage: async (to: string, imageUrl: string, caption: string) => {
                console.log(`[MOCK] whatsappService.sendImage called!`);
                sentTo = to;
                sentImageUrl = imageUrl;
                sentCaption = caption;
                return 'MOCK-MSG-ID';
            }
        }
    };

    const args = {
        imageUrl: 'https://example.com/mock-shoe.jpg',
        caption: 'Here is the beautiful red shoe!'
    };

    try {
        const result = await handleInventoryTools('send_product_image', args, mockCtx);
        console.log('Tool Result:', result);
        console.log('Assertions:');
        console.log('- Sent To:', sentTo === '1234567890' ? '✅' : '❌ ' + sentTo);
        console.log('- Image URL:', sentImageUrl === args.imageUrl ? '✅' : '❌ ' + sentImageUrl);
        console.log('- Caption:', sentCaption === args.caption ? '✅' : '❌ ' + sentCaption);
    } catch (e) {
        console.error('Test failed:', e);
    }
}

runTest();
