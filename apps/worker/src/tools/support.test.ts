import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCommerceTools } from './commerce.js';

// Mock the external dependencies
vi.mock('@naija-agent/firebase', () => ({
  logSystemEvent: vi.fn(),
}));

describe('Principle-Centered Support Escalation', () => {
    let mockWhatsappService: any;
    let mockContext: any;
    
    beforeEach(() => {
        mockWhatsappService = {
            sendText: vi.fn().mockResolvedValue(true)
        };
        
        mockContext = {
            orgId: 'test_org',
            from: '2348000000000',
            isAdmin: false,
            orgConfig: {
                adminPhone: '2349000000000'
            },
            whatsappService: mockWhatsappService,
        };
    });

    it('should successfully escalate customer issue to the admin via WhatsApp', async () => {
        const args = {
            reason: 'My payment failed and I got debited',
            urgency: 'critical'
        };

        const result = await handleCommerceTools('request_human_support', args, mockContext);
        
        // Ensure the bot tells the user they are being handed off
        expect(result.status).toBe('Escalated');
        expect(result.message).toContain('notified my Boss');
        
        // Ensure the boss is actually pinged via the WhatsApp service
        expect(mockWhatsappService.sendText).toHaveBeenCalledTimes(1);
        expect(mockWhatsappService.sendText).toHaveBeenCalledWith(
            '2349000000000',
            expect.stringContaining('CUSTOMER SUPPORT ESCALATION: CRITICAL')
        );
        expect(mockWhatsappService.sendText).toHaveBeenCalledWith(
            '2349000000000',
            expect.stringContaining('2348000000000') // Customer's phone number included
        );
        expect(mockWhatsappService.sendText).toHaveBeenCalledWith(
            '2349000000000',
            expect.stringContaining('My payment failed and I got debited') // Reason included
        );
    });
});
