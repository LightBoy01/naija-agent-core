"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigSchema = exports.JobDataSchema = exports.WhatsAppWebhookSchema = exports.WhatsAppEntrySchema = exports.WhatsAppChangeSchema = exports.WhatsAppValueSchema = exports.WhatsAppMessageSchema = void 0;
const zod_1 = require("zod");
// --- WhatsApp Webhook Schemas (Meta) ---
exports.WhatsAppMessageSchema = zod_1.z.object({
    from: zod_1.z.string(),
    id: zod_1.z.string(),
    timestamp: zod_1.z.string(),
    type: zod_1.z.enum(['text', 'audio', 'image', 'document', 'sticker', 'unknown']).or(zod_1.z.string()),
    text: zod_1.z.object({ body: zod_1.z.string() }).optional(),
    audio: zod_1.z.object({ id: zod_1.z.string(), mime_type: zod_1.z.string() }).optional(),
    image: zod_1.z.object({ id: zod_1.z.string(), mime_type: zod_1.z.string(), caption: zod_1.z.string().optional() }).optional(),
});
exports.WhatsAppValueSchema = zod_1.z.object({
    messaging_product: zod_1.z.literal('whatsapp'),
    metadata: zod_1.z.object({
        display_phone_number: zod_1.z.string(),
        phone_number_id: zod_1.z.string(),
    }),
    contacts: zod_1.z.array(zod_1.z.object({
        profile: zod_1.z.object({ name: zod_1.z.string() }),
        wa_id: zod_1.z.string(),
    })).optional(),
    messages: zod_1.z.array(exports.WhatsAppMessageSchema).optional(),
    statuses: zod_1.z.array(zod_1.z.any()).optional(), // We ignore statuses for now
});
exports.WhatsAppChangeSchema = zod_1.z.object({
    value: exports.WhatsAppValueSchema,
    field: zod_1.z.literal('messages'),
});
exports.WhatsAppEntrySchema = zod_1.z.object({
    id: zod_1.z.string(),
    changes: zod_1.z.array(exports.WhatsAppChangeSchema),
});
exports.WhatsAppWebhookSchema = zod_1.z.object({
    object: zod_1.z.literal('whatsapp_business_account'),
    entry: zod_1.z.array(exports.WhatsAppEntrySchema),
});
// --- Internal Job Schemas (Queue) ---
exports.JobDataSchema = zod_1.z.object({
    type: zod_1.z.enum(['text', 'audio']),
    orgId: zod_1.z.string().uuid(),
    phoneId: zod_1.z.string(), // The business phone ID
    from: zod_1.z.string(), // The user's phone number
    name: zod_1.z.string().optional(), // User's profile name
    messageId: zod_1.z.string(),
    timestamp: zod_1.z.number(),
    content: zod_1.z.object({
        text: zod_1.z.string().optional(),
        audioId: zod_1.z.string().optional(), // We fetch the URL in the worker
        mimeType: zod_1.z.string().optional(),
    }),
});
// --- Configuration Schemas (Tenant) ---
exports.ConfigSchema = zod_1.z.object({
    systemPrompt: zod_1.z.string(),
    model: zod_1.z.enum(['gemini-1.5-flash', 'gemini-1.5-pro']).default('gemini-1.5-flash'),
    tools: zod_1.z.array(zod_1.z.string()).default([]), // List of enabled tool names
});
