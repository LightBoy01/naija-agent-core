import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios');
vi.mock('libphonenumber-js', () => ({
  parsePhoneNumber: vi.fn(),
}));
vi.mock('form-data', () => {
  const FormData = function(this: any) {
    this.append = vi.fn();
    this.getHeaders = vi.fn().mockReturnValue({});
  };
  return { default: FormData };
});

import axios from 'axios';
import { WhatsAppService } from '../../src/services/whatsapp.js';

const mockedAxios = vi.mocked(axios);

describe('WhatsAppService - sendText', () => {
  let svc: WhatsAppService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new WhatsAppService('fake-token', '1234567890', 'fake-secret');
  });

  it('should route sovereign phoneIds to sidecar /send', async () => {
    const sovereignSvc = new WhatsAppService('fake-token', 'baileys-zynux');
    mockedAxios.post = vi.fn().mockResolvedValue({ data: {} });

    const result = await sovereignSvc.sendText('2348012345678', 'Hello');
    expect(result).toMatch(/^SOV-/);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/send'),
      expect.objectContaining({ orgId: 'zynux', to: '2348012345678', text: 'Hello' }),
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) }),
    );
  });

  it('should route WABA phoneIds to Meta API', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({
      data: {
        messaging_product: 'whatsapp',
        contacts: [{ input: '2348012345678', wa_id: '2348012345678' }],
        messages: [{ id: 'wamid.test123' }],
      },
    });

    const result = await svc.sendText('2348012345678', 'Hello');
    expect(result).toBe('wamid.test123');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('graph.facebook.com'),
      expect.objectContaining({ type: 'text', text: { body: 'Hello' } }),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer fake-token' }) }),
    );
  });

  it('should reject empty text with fallback', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({
      data: {
        messaging_product: 'whatsapp',
        contacts: [{ input: '2348012345678', wa_id: '2348012345678' }],
        messages: [{ id: 'wamid.fallback' }],
      },
    });

    const result = await svc.sendText('2348012345678', '   ');
    expect(result).toBe('wamid.fallback');
  });
});

describe('WhatsAppService - sendImage', () => {
  let svc: WhatsAppService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new WhatsAppService('fake-token', '1234567890', 'fake-secret');
  });

  it('should upload Buffer to Meta media API and send by ID for WABA', async () => {
    const buf = Buffer.from('fake-image-data');
    mockedAxios.post = vi.fn()
      .mockResolvedValueOnce({ data: { id: 'media-001' } }) // uploadBuffer
      .mockResolvedValueOnce({ // sendImage message
        data: {
          messaging_product: 'whatsapp',
          contacts: [{ input: '2348012345678', wa_id: '2348012345678' }],
          messages: [{ id: 'wamid.img001' }],
        },
      });

    const result = await svc.sendImage('2348012345678', buf, 'Check this');
    expect(result).toBe('wamid.img001');

    const mediaCall = mockedAxios.post.mock.calls[0];
    expect(mediaCall[0]).toContain('/media');
    expect(mediaCall[0]).toContain('graph.facebook.com');

    const sendCall = mockedAxios.post.mock.calls[1];
    expect(sendCall[0]).toContain('/messages');
    expect(sendCall[1]).toEqual(expect.objectContaining({
      type: 'image',
      image: expect.objectContaining({ id: 'media-001', caption: 'Check this' }),
    }));
  });

  it('should send URL image via Meta API for WABA', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({
      data: {
        messaging_product: 'whatsapp',
        contacts: [{ input: '2348012345678', wa_id: '2348012345678' }],
        messages: [{ id: 'wamid.url001' }],
      },
    });

    const result = await svc.sendImage('2348012345678', 'https://example.com/img.jpg', 'URL image');
    expect(result).toBe('wamid.url001');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({
        type: 'image',
        image: expect.objectContaining({ link: 'https://example.com/img.jpg', caption: 'URL image' }),
      }),
      expect.anything(),
    );
  });

  it('should route sovereign Buffer via sidecar /send-media', async () => {
    const sovSvc = new WhatsAppService('fake-token', 'baileys-zynux');
    const buf = Buffer.from('fake-image-data');
    mockedAxios.post = vi.fn().mockResolvedValue({ data: {} });

    const result = await sovSvc.sendImage('2348012345678', buf, 'Sovereign image');
    expect(result).toMatch(/^SOV-IMG-/);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/send-media'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should route sovereign URL as text fallback via sidecar /send', async () => {
    const sovSvc = new WhatsAppService('fake-token', 'baileys-zynux');
    mockedAxios.post = vi.fn().mockResolvedValue({ data: {} });

    const result = await sovSvc.sendImage('2348012345678', 'https://example.com/img.jpg', 'Link');
    expect(result).toMatch(/^SOV-IMG-/);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/send'),
      expect.objectContaining({ text: expect.stringContaining('https://example.com/img.jpg') }),
      expect.anything(),
    );
  });
});

describe('WhatsAppService - sidecar helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendToSovereign should POST to /send with correct headers', async () => {
    const svc = new WhatsAppService('fake-token', 'baileys-zynux');
    mockedAxios.post = vi.fn().mockResolvedValue({ data: {} });

    process.env.ADMIN_API_KEY = 'test-key';
    const result = await svc.sendText('2348012345678', 'Test');
    expect(result).toMatch(/^SOV-/);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/send'),
      expect.anything(),
      expect.objectContaining({ headers: expect.objectContaining({ 'X-API-Key': 'test-key' }) }),
    );
    delete process.env.ADMIN_API_KEY;
  });

  it('sendMediaToSovereign should POST multipart to /send-media', async () => {
    const svc = new WhatsAppService('fake-token', 'baileys-zynux');
    mockedAxios.post = vi.fn().mockResolvedValue({ data: {} });

    const buf = Buffer.from('fake-image-data');
    const result = await svc.sendImage('2348012345678', buf);
    expect(result).toMatch(/^SOV-IMG-/);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/send-media'),
      expect.anything(),
      expect.anything(),
    );
  });
});

describe('WhatsAppService - sendTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should route numeric sovereign IDs to sidecar /send instead of Meta Graph API', async () => {
    const svc = new WhatsAppService('fake-token', '2349015772541'); // Aelixxr numeric ID
    mockedAxios.post = vi.fn().mockResolvedValue({ data: {} });

    const result = await svc.sendTemplate('2348012345678', 'hello_world', 'en_US');
    expect(result).toMatch(/^SOV-TMP-/);
    
    // Check that it calls sidecar /send and NOT graph.facebook.com
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/send'),
      expect.objectContaining({ to: '2348012345678', text: '[TEMPLATE: hello_world]' }),
      expect.anything(),
    );
  });
});
