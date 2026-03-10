import { z } from 'zod';

// --- WhatsApp Webhook Schemas (Meta) ---\n
export const WhatsAppMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.enum(['text', 'audio', 'image', 'document', 'video', 'button', 'interactive']),
  text: z.object({ body: z.string() }).optional(),
  audio: z.object({ id: z.string(), mime_type: z.string() }).optional(),
  image: z.object({ id: z.string(), mime_type: z.string(), caption: z.string().optional() }).optional(),
});

export type WhatsAppMessage = z.infer<typeof WhatsAppMessageSchema>;

export const WhatsAppWebhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(z.object({
    id: z.string(),
    changes: z.array(z.object({
      value: z.object({
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
      }),
      field: z.literal('messages'),
    })),
  })),
});

export type WhatsAppWebhook = z.infer<typeof WhatsAppWebhookSchema>;

// --- Job Schemas (BullMQ) ---\n
export const JobDataSchema = z.object({
  from: z.string(),
  name: z.string().optional(),
  content: z.any(),
  type: z.string(),
  orgId: z.string(),
  messageId: z.string(),
  phoneId: z.string().optional(),
  timestamp: z.number(),
});

export type JobData = z.infer<typeof JobDataSchema>;

// --- Firestore Schemas (Organizations) ---\n
export const BankDetailsSchema = z.object({
  bankName: z.string(),
  accountNumber: z.string(),
  accountName: z.string(),
});

export type BankDetails = z.infer<typeof BankDetailsSchema>;

export const PaymentConfigSchema = z.object({
  provider: z.enum(['paystack', 'monnify']),
  secretKey: z.string(),
  publicKey: z.string().optional(),
});

export type PaymentConfig = z.infer<typeof PaymentConfigSchema>;

export const ActivitySchema = z.object({
  id: z.string(),
  type: z.enum(['order', 'booking', 'waybill', 'donation']),
  status: z.enum(['pending', 'confirmed', 'picked_up', 'in_transit', 'delivered', 'cancelled']),
  summary: z.string(),
  amount: z.number().optional(), // In Naira
  customerPhone: z.string().optional(),
  assignedStaffPhone: z.string().optional(),
  createdAt: z.any(), // Firestore Timestamp
  updatedAt: z.any(),
});

export type Activity = z.infer<typeof ActivitySchema>;

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(), // In Naira
  stock: z.number().optional(),
  category: z.string().optional(),
  imageUrl: z.string().optional(),
  updatedAt: z.any(),
});

export type Product = z.infer<typeof ProductSchema>;

export const StaffSchema = z.object({
  phone: z.string(),
  name: z.string(),
  role: z.enum(['rider', 'assistant', 'teacher']),
  isActive: z.boolean().default(true),
  createdAt: z.any(),
});

export type Staff = z.infer<typeof StaffSchema>;

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  whatsappPhoneId: z.string(),
  isActive: z.boolean().default(true),
  balance: z.number().default(0), // In Kobo
  costPerReply: z.number().default(2000), // Default 20 kobo
  costPerImage: z.number().optional(),
  status: z.enum(['PENDING_PAYMENT', 'PENDING_META', 'AWAITING_OTP', 'ACTIVE', 'SUSPENDED']).default('ACTIVE'),
  deploymentModel: z.enum(['SHARED', 'INDEPENDENT']).default('SHARED'),
  trialStartedAt: z.any().optional(),
  trialMessageCount: z.number().default(0),
  systemPrompt: z.string().optional(),
  onboardingStep: z.string().optional(), // e.g. 'NAME', 'PIN', 'BANK', 'TONE', 'COMPLETE'
  onboardingData: z.any().optional(), // Temporary storage for setup data
  config: z.any().optional(),
  updatedAt: z.any(),
});

export type Organization = z.infer<typeof OrganizationSchema>;

export const DailySnapshotSchema = z.object({
  totalSalesKobo: z.number().default(0),
  totalChats: z.number().default(0),
  newCustomers: z.number().default(0),
  pendingActivities: z.number().default(0),
  topProducts: z.array(z.string()).default([]),
  aiInsights: z.string().optional(), // For the Sunday report
});

export type DailySnapshot = z.infer<typeof DailySnapshotSchema>;

export const ConfigSchema = z.object({
  systemPrompt: z.string().optional(),
  model: z.enum(['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.5-flash']).default('gemini-1.5-flash'),
  tools: z.array(z.string()).default([]), // List of enabled tool names
  payment: PaymentConfigSchema.optional(), // Per-tenant payment config
  bankDetails: BankDetailsSchema.optional(), // The Boss's bank details for customer payments
  sovereignBankDetails: BankDetailsSchema.optional(), // The Sovereign's bank details for AI credit top-ups
  whatsappToken: z.string().optional(), // Per-tenant WhatsApp token
  appSecret: z.string().optional(), // Per-tenant Meta App secret
  bridgeSecret: z.string().optional(), // Scoped key for SMS bridge auth (Phase 5.8)
  useSmsBridge: z.boolean().default(false), // Toggle for auto-matching engine
  adminPhone: z.string().optional(), // The Boss's phone number
  adminPin: z.string().optional(), // 4-digit PIN for high-value actions
  mfaCode: z.string().optional(), // Temporary 6-digit MFA code
  mfaExpiresAt: z.string().optional(), // ISO timestamp for MFA expiry
  isMaster: z.boolean().optional(), // Sovereign powers flag
});

export type Config = z.infer<typeof ConfigSchema>;
