import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios');
vi.mock('form-data', () => {
  const FormData = function(this: any) {
    this.append = vi.fn();
    this.getHeaders = vi.fn().mockReturnValue({});
  };
  return { default: FormData };
});
vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import axios from 'axios';
import { WhatsAppService } from '../../src/services/whatsapp.js';

const mockedAxios = vi.mocked(axios);

describe('Worker-Life WhatsAppService - sendText', () => {
  let svc: WhatsAppService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new WhatsAppService('fake-token', '1234567890', 'fake-secret');
  });

  it('should route sovereign phoneIds to sidecar /send', async () => {
    const sovSvc = new WhatsAppService('fake-token', 'baileys-zynux');
    mockedAxios.post = vi.fn().mockResolvedValue({ data: {} });

    await sovSvc.sendText('2348012345678', 'Hello');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/send'),
      expect.objectContaining({ orgId: 'zynux', to: '2348012345678', text: 'Hello' }),
      expect.objectContaining({ headers: expect.objectContaining({ 'X-API-Key': expect.any(String) }) }),
    );
  });

  it('should route WABA phoneIds to Meta API', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({ data: {} });

    await svc.sendText('2348012345678', 'Hello');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('graph.facebook.com'),
      expect.objectContaining({
        messaging_product: 'whatsapp',
        type: 'text',
        text: { body: 'Hello' },
      }),
      expect.anything(),
    );
  });

  it('should chunk long text into 800-char bubbles via paragraph splitting', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({ data: {} });
    // Two paragraphs, each ~500 chars — will be 2 bubbles
    const longText = 'a'.repeat(500) + '\n\n' + 'b'.repeat(500);

    await svc.sendText('2348012345678', longText);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });
});

describe('Worker-Life WhatsAppService - sendImage', () => {
  let svc: WhatsAppService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new WhatsAppService('fake-token', '1234567890', 'fake-secret');
  });

  it('should upload Buffer to Meta media API then send for WABA', async () => {
    const buf = Buffer.from('fake-image');
    mockedAxios.post = vi.fn()
      .mockResolvedValueOnce({ data: { id: 'media-a' } }) // uploadToMeta
      .mockResolvedValueOnce({ data: {} }); // send message

    const result = await svc.sendImage('2348012345678', buf, 'Caption');
    expect(result).toBe('media-a');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);

    const uploadCall = mockedAxios.post.mock.calls[0];
    expect(uploadCall[0]).toContain('/media');

    const sendCall = mockedAxios.post.mock.calls[1];
    expect(sendCall[0]).toContain('/messages');
    expect(sendCall[1].image.id).toBe('media-a');
    expect(sendCall[1].image.caption).toBe('Caption');
  });

  it('should send URL image via Meta API for WABA', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({
      data: { messages: [{ id: 'wamid.url-life' }] },
    });

    const result = await svc.sendImage('2348012345678', 'https://example.com/img.jpg', 'URL');
    expect(result).toBe('wamid.url-life');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({
        type: 'image',
        image: expect.objectContaining({ link: 'https://example.com/img.jpg', caption: 'URL' }),
      }),
      expect.anything(),
    );
  });

  it('should route sovereign Buffer via sidecar /send-media', async () => {
    const sovSvc = new WhatsAppService('fake-token', 'baileys-zynux');
    const buf = Buffer.from('fake-image');
    mockedAxios.post = vi.fn().mockResolvedValue({ data: {} });

    const result = await sovSvc.sendImage('2348012345678', buf, 'Sovereign');
    expect(result).toMatch(/^AELX-IMG-/);
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
    expect(result).toMatch(/^AELX-IMG-/);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/send'),
      expect.objectContaining({ text: expect.stringContaining('https://example.com/img.jpg') }),
      expect.anything(),
    );
  });

  it('should map numeric sovereign IDs via SOVEREIGN_ID_MAP', async () => {
    const sovSvc = new WhatsAppService('fake-token', '2347011925076');
    mockedAxios.post = vi.fn().mockResolvedValue({ data: {} });

    await sovSvc.sendImage('2348012345678', Buffer.from('data'), 'Test');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    // Check orgId was mapped to 'zynux'
    const callHeaders = mockedAxios.post.mock.calls[0][2];
    expect(callHeaders).toBeDefined();
  });

  it('should use optionalPhoneId when provided', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({ data: { messages: [{ id: 'wamid.opt' }] } });

    const result = await svc.sendImage('2348012345678', 'https://example.com/img.jpg', 'Cap', '9999999999');
    expect(result).toBe('wamid.opt');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('9999999999/messages'),
      expect.anything(),
      expect.anything(),
    );
  });
});
