import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSystemTools } from '../../src/tools/system';

describe('send_direct_message', () => {
  const mockSendText = vi.fn().mockResolvedValue(true);
  
  const mockCtxBase: any = {
    whatsappService: {
      sendText: mockSendText
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should block non-admins from sending direct messages', async () => {
    const ctx = { ...mockCtxBase, isAdmin: false };
    const result = await handleSystemTools('send_direct_message', { phone: '23480000000', message: 'Hello' }, ctx);
    
    expect(result.status).toBe('error');
    expect(result.code).toBe('UNAUTHORIZED');
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it('should allow admins to send direct messages successfully', async () => {
    const ctx = { ...mockCtxBase, isAdmin: true };
    const result = await handleSystemTools('send_direct_message', { phone: '23480000000', message: 'Hello' }, ctx);
    
    expect(result.status).toBe('success');
    expect(result.message).toContain('Message successfully sent');
    expect(mockSendText).toHaveBeenCalledWith('23480000000', 'Hello');
  });

  it('should handle errors gracefully if whatsapp service fails', async () => {
    const errorSendText = vi.fn().mockRejectedValue(new Error('Network failure'));
    const ctx = { ...mockCtxBase, isAdmin: true, whatsappService: { sendText: errorSendText } };
    
    const result = await handleSystemTools('send_direct_message', { phone: '23480000000', message: 'Hello' }, ctx);
    
    expect(result.status).toBe('error');
    expect(result.message).toContain('Network failure');
    expect(errorSendText).toHaveBeenCalled();
  });
});
