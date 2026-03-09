import { z } from 'zod';

// --- WhatsApp Webhook Schemas (Meta) ---

export const WhatsAppMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.enum(['text', 'audio', 'image', 'document', 'sticker', 'unknown']).or(z.string()),
  text: z.object({ body: z.string() }).optional(),
  audio: z.object({ id: z.string(), mime_type: z.string() }).optional(),
  image: z.object({ id: z.string(), mime_type: z.string(), caption: z.string().optional() }).optional(),
});

export const WhatsAppValueSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  metadata: z.object({
    display_phone_number: z.string(),
    phone_number_id: z.string(),
  }),
  contacts: z.array(z.object({
    profile: z.object({ name: z.string() }),
    wa_id: z.string(),
  })).optional(),
  messages: z.array(WhatsAppMessageSchema).optional(),
  statuses: z.array(z.any()).optional(), // We ignore statuses for now
});

export const WhatsAppChangeSchema = z.object({
  value: WhatsAppValueSchema,
  field: z.literal('messages'),
});

export const WhatsAppEntrySchema = z.object({
  id: z.string(),
  changes: z.array(WhatsAppChangeSchema),
});

export const WhatsAppWebhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(WhatsAppEntrySchema),
});

export type WhatsAppWebhook = z.infer<typeof WhatsAppWebhookSchema>;
export type WhatsAppMessage = z.infer<typeof WhatsAppMessageSchema>;


// --- Internal Job Schemas (Queue) ---

export const JobDataSchema = z.object({
  type: z.enum(['text', 'audio', 'image', 'template']),
  orgId: z.string().uuid().optional(), // Optional for outbound system messages
  phoneId: z.string(), // The business phone ID
  from: z.string(), // The user's phone number (recipient for outbound)
  name: z.string().optional(), // User's profile name
  messageId: z.string().optional(), // Optional for outbound
  timestamp: z.number(),
  content: z.object({
    text: z.string().optional(),
    audioId: z.string().optional(), // We fetch the URL in the worker
    imageId: z.string().optional(), // Image ID for fetching
    caption: z.string().optional(), // Image caption
    mimeType: z.string().optional(),
    templateName: z.string().optional(),
    languageCode: z.string().optional(),
  }),
});

export type JobData = z.infer<typeof JobDataSchema>;


// --- Configuration Schemas (Tenant) ---

export const PaymentConfigSchema = z.object({
  provider: z.enum(['paystack', 'monnify']).default('paystack'),
  secretKey: z.string(),
});

export type PaymentConfig = z.infer<typeof PaymentConfigSchema>;

export const ConfigSchema = z.object({
  systemPrompt: z.string(),
  model: z.enum(['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.5-flash']).default('gemini-1.5-flash'),
  tools: z.array(z.string()).default([]), // List of enabled tool names
  payment: PaymentConfigSchema.optional(), // Per-tenant payment config
  whatsappToken: z.string().optional(), // Per-tenant WhatsApp token
  appSecret: z.string().optional(), // Per-tenant Meta App secret
  adminPhone: z.string().optional(), // The Boss's phone number
  adminPin: z.string().optional(), // 4-digit PIN for high-value actions
  isMaster: z.boolean().optional(), // Sovereign powers flag
});

export type Config = z.infer<typeof ConfigSchema>;
