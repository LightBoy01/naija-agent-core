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
// --- Internal Job Schemas (Queue) ---
export const JobDataSchema = z.object({
    type: z.enum(['text', 'audio']),
    orgId: z.string().uuid(),
    phoneId: z.string(), // The business phone ID
    from: z.string(), // The user's phone number
    name: z.string().optional(), // User's profile name
    messageId: z.string(),
    timestamp: z.number(),
    content: z.object({
        text: z.string().optional(),
        audioId: z.string().optional(), // We fetch the URL in the worker
        mimeType: z.string().optional(),
    }),
});
// --- Configuration Schemas (Tenant) ---
export const ConfigSchema = z.object({
    systemPrompt: z.string(),
    model: z.enum(['gemini-1.5-flash', 'gemini-1.5-pro']).default('gemini-1.5-flash'),
    tools: z.array(z.string()).default([]), // List of enabled tool names
});
