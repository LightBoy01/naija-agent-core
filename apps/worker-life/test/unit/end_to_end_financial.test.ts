import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@naija-agent/firebase', () => ({
    getDb: vi.fn(),
    verifyUserPin: vi.fn(),
    setUserPin: vi.fn()
}));

vi.mock('../../src/services/lifeMemory.js', () => ({
    lifeMemory: {
        getContext: vi.fn(),
        updateContext: vi.fn(),
        deductVaultBalance: vi.fn(),
        addVaultBalance: vi.fn(),
        addEnergy: vi.fn()
    }
}));

vi.mock('../../src/services/auditService.js', () => ({
    auditService: {
        logVaultAction: vi.fn().mockResolvedValue('log_123'),
        updateLogStatus: vi.fn()
    }
}));

vi.mock('../../src/services/monnifyClient.js', () => ({
    monnify: {
        vendUtility: vi.fn()
    }
}));

vi.mock('../../src/utils/logger.js', () => ({
    logger: {
        error: vi.fn((err, msg) => console.log("LOGGER ERROR:", err)),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));

vi.mock('@naija-agent/payments', () => {
    class MockPeyflexProvider {
        async purchaseAirtimeData() { return { success: true }; }
    }
    class MockPocketFiProvider {
        async createVirtualAccount() {}
        async verifyBVN() {}
        async verifyNIN() {}
        async sendWhatsAppOTP() {}
    }
    return {
        PeyflexProvider: MockPeyflexProvider,
        PocketFiProvider: MockPocketFiProvider
    };
});

vi.mock('../../src/services/pocketfiClient.js', () => ({
    pocketfi: {
        sendWhatsAppOTP: vi.fn().mockResolvedValue({ success: true, message: 'OTP Sent' })
    }
}));

import { executeUtilityTool } from '../../src/tools/utilityTools.js';
import { executeVaultTool } from '../../src/tools/finance/vault.js';
import { lifeMemory } from '../../src/services/lifeMemory.js';
import { verifyUserPin, setUserPin } from '@naija-agent/firebase';
import { PeyflexProvider, PocketFiProvider } from '@naija-agent/payments';

describe('End-to-End Financial Workflows', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Virtual Account & PIN Reset (PocketFi)', () => {
        it('should execute request_pin_reset using PocketFi OTP', async () => {
            const res = await executeVaultTool('request_pin_reset', { userId: '2348012345678', reason: 'forgot_pin' });
            
            expect(res.status).toBe('success');
            expect(lifeMemory.updateContext).toHaveBeenCalledWith('2348012345678', expect.objectContaining({
                resetOtp: expect.any(String),
                resetOtpExpiry: expect.any(Number)
            }));
        });

        it('should execute confirm_pin_reset successfully', async () => {
            (lifeMemory.getContext as any).mockResolvedValue({
                resetOtp: '123456',
                resetOtpExpiry: Date.now() + 10000
            });
            
            // The fix we made should handle numbers converted to string
            const res = await executeVaultTool('confirm_pin_reset', { userId: '2348012345678', otp: 123456, newPin: '4321' });
            
            expect(setUserPin).toHaveBeenCalledWith('2348012345678', '4321');
            expect(res.status).toBe('success');
        });
    });

    describe('Utility Vending & Two-Phase Commit (Peyflex)', () => {
        it('should successfully deduct and vend airtime', async () => {
            (lifeMemory.getContext as any).mockResolvedValue({ pin: 'hashed' });
            (verifyUserPin as any).mockResolvedValue(true);
            (lifeMemory.deductVaultBalance as any).mockResolvedValue(40000); // 400 NGN left
            
            vi.spyOn(PeyflexProvider.prototype, 'purchaseAirtimeData').mockResolvedValue({
                success: true, data: { reference: 'ref_123' }
            });
            
            const res = await executeUtilityTool('vend_utility', {
                userId: '2348012345678',
                amountNaira: 100,
                productCode: 'PEYFLEX_AIRTIME_MTN',
                customerId: '08012345678',
                validationReference: 'valid_123',
                pin: '1234'
            });
            console.log("TEST RESULT 1:", res);
            
            expect(verifyUserPin).toHaveBeenCalledWith('2348012345678', '1234');
            // 100 NGN + 0 NGN fee = 10000 kobo deduction
            expect(lifeMemory.deductVaultBalance).toHaveBeenCalledWith('2348012345678', 10000);
            expect(res.status).toBe('success');
            expect(lifeMemory.addVaultBalance).not.toHaveBeenCalled();
        });

        it('should execute rollback (refund) if Peyflex fails', async () => {
            (lifeMemory.getContext as any).mockResolvedValue({ pin: 'hashed' });
            (verifyUserPin as any).mockResolvedValue(true);
            (lifeMemory.deductVaultBalance as any).mockResolvedValue(40000);
            
            // Simulate Peyflex API Failure
            vi.spyOn(PeyflexProvider.prototype, 'purchaseAirtimeData').mockResolvedValue({
                success: false, message: 'Network Timeout'
            });
            
            const res = await executeUtilityTool('vend_utility', {
                userId: '2348012345678',
                amountNaira: 100,
                productCode: 'PEYFLEX_AIRTIME_MTN',
                customerId: '08012345678',
                validationReference: 'valid_123',
                pin: '1234'
            });
            console.log("TEST RESULT 2:", res);
            
            // Should have deducted first
            expect(lifeMemory.deductVaultBalance).toHaveBeenCalledWith('2348012345678', 10000);
            
            // Should have refunded automatically due to API failure!
            expect(lifeMemory.addVaultBalance).toHaveBeenCalledWith('2348012345678', 10000, expect.stringContaining('rollback_vend_'), 'refund');
            
            expect(res.error).toContain('Network Timeout');
        });
    });
});
