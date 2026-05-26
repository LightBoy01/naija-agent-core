import { z } from 'zod';
import { EntityDefinitionSchema } from './sector.js';

export * from './sector.js';
export * from './interfaces/index.js';
export * from './config/index.js';
export * from './config/prompts.js';
export * from './utils/phone.js';
export * from './utils/currency.js';

// --- WhatsApp Webhook Schemas (Meta) ---\n
export const WhatsAppMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.enum(['text', 'image', 'audio', 'voice', 'document', 'video', 'button', 'interactive']),
  text: z.object({ body: z.string() }).optional(),
  audio: z.object({ id: z.string(), mime_type: z.string() }).optional(),
  voice: z.object({ id: z.string(), mime_type: z.string() }).optional(),
  image: z.object({ id: z.string(), mime_type: z.string(), caption: z.string().optional() }).optional(),
  document: z.object({ id: z.string(), mime_type: z.string(), filename: z.string().optional(), caption: z.string().optional() }).optional(),
  button: z.object({ payload: z.string(), text: z.string() }).optional(),
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
          profile: z.object({ name: z.string() }).optional(),
          wa_id: z.string(),
        })).optional(),
        messages: z.array(WhatsAppMessageSchema).optional(),
      }),
      field: z.literal('messages'),
    })),
  })),
});

export type WhatsAppWebhook = z.infer<typeof WhatsAppWebhookSchema>;

// --- Job Schemas (BullMQ) ---
// JobData is now imported from ./interfaces/index.js

// --- Firestore Schemas (Organizations) ---

// Loose check for Firestore Timestamp object, Date, or ISO string
export const FirestoreTimestampSchema = z.union([
  z.object({ seconds: z.number(), nanoseconds: z.number() }),
  z.date(),
  z.string()
]);

export type FirestoreTimestamp = z.infer<typeof FirestoreTimestampSchema>;

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
  type: z.enum(['order', 'booking', 'waybill', 'donation', 'task']),
  status: z.enum(['pending', 'pending_payment', 'confirmed', 'ready_for_pickup', 'picked_up', 'in_transit', 'delivered', 'cancelled']),
  summary: z.string(),
  amount: z.number().optional(), // In Naira
  customerPhone: z.string().optional(),
  assignedStaffPhone: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: FirestoreTimestampSchema,
  updatedAt: FirestoreTimestampSchema,
});

export type Activity = z.infer<typeof ActivitySchema>;
export type ActivityType = Activity['type'];
export type ActivityStatus = Activity['status'];

export const EntitySchema = z.record(z.any()).and(z.object({
  id: z.string(),
  updatedAt: FirestoreTimestampSchema.optional(),
}));

export type Entity = z.infer<typeof EntitySchema>;

// Temporarily alias Product to Entity to prevent build failures during migration
export const ProductSchema = EntitySchema;
export type Product = Entity;

export const StaffSchema = z.object({
  phone: z.string(),
  name: z.string(),
  role: z.enum(['rider', 'assistant', 'teacher']),
  isActive: z.boolean().default(true),
  createdAt: FirestoreTimestampSchema,
});

export type Staff = z.infer<typeof StaffSchema>;

export const OnboardingDataSchema = z.object({
  name: z.string().optional(),
  adminPin: z.string().optional(), // Hashed
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  accountName: z.string().optional(),
  systemPrompt: z.string().optional(),
  timezone: z.string().optional(),
  botPhone: z.string().optional(),
});

export type OnboardingData = z.infer<typeof OnboardingDataSchema>;

// ConfigSchema needs to be defined BEFORE OrganizationSchema to be used inside it
export const ConfigSchema = z.object({
  systemPrompt: z.string().optional(),
  model: z.enum(['gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemma-4-26b-a4b-it', 'gemini-2.0-flash']).default('gemma-4-26b-a4b-it'),
  tools: z.array(z.string()).default([]), // List of enabled tool names
  payment: PaymentConfigSchema.optional(), // Per-tenant payment config
  bankDetails: BankDetailsSchema.optional(), // The Boss's bank details for customer payments
  sovereignBankDetails: BankDetailsSchema.optional(), // The Sovereign's bank details for AI credit top-ups
  whatsappToken: z.string().optional(), // Per-tenant WhatsApp token
  appSecret: z.string().optional(), // Per-tenant Meta App secret
  bridgeSecret: z.string().optional(), // Scoped key for SMS bridge auth (Phase 5.8)
  useSmsBridge: z.boolean().default(false), // Toggle for auto-matching engine
  adminPhone: z.string().optional(), // The Boss's phone number
  commandCenterGroupId: z.string().optional(), // Group for Ops/Riders (Phase 7.2)
  notificationPolicy: z.enum(['boss_only', 'group_only', 'dual']).default('boss_only'), // Where to send alerts (Phase 7.2)
  adminPin: z.string().optional(), // Hashed PIN for high-value actions
  timezone: z.string().optional(), // Business timezone (e.g. Africa/Lagos)
  mfaCode: z.string().optional(), // Temporary 6-digit MFA code
  mfaExpiresAt: z.string().optional(), // ISO timestamp for MFA expiry
  isMaster: z.boolean().optional(), // Sovereign powers flag
  staffDailyLimit: z.number().optional(),
  botPhone: z.string().optional(),
  legacy_whitelist: z.boolean().optional(),
  sessionStatus: z.string().optional(),
  sessionExpiry: z.string().optional(), // ISO String
  rateLimit: z.object({
    windowSeconds: z.number().default(60),
    maxRequests: z.number().default(10)
  }).optional(),
  alerts: z.object({
    lowBalanceThreshold: z.number().default(50000)
  }).optional(),
  logistics: z.object({
    provider: z.string().optional(),
    apiKey: z.string().optional()
  }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  whatsappPhoneId: z.string(),
  isActive: z.boolean().default(true),
  balance: z.number().default(0), // In Kobo
  reservedBalance: z.number().default(0), // Kobo locked in pending transactions (Phase 7.2)
  costPerReply: z.number().default(2000), // Default 20 kobo
  costPerImage: z.number().optional(),
  costPerDocument: z.number().optional(),
  status: z.enum(['PENDING_PAYMENT', 'PENDING_META', 'AWAITING_OTP', 'ACTIVE', 'SUSPENDED', 'TRIAL']).default('ACTIVE'),
  deploymentModel: z.enum(['SHARED', 'INDEPENDENT']).default('SHARED'),
  currency: z.object({
    code: z.string(),
    symbol: z.string(),
    locale: z.string(),
    rate: z.number().default(1.0)
  }),
  region: z.enum(['NG', 'US', 'UK', 'GLOBAL']).default('NG'),
  timezone: z.string().default('Africa/Lagos'),
  sector: z.string().default('commerce'),
  trialStartedAt: FirestoreTimestampSchema.optional(),
  trialMessageCount: z.number().default(0),
  systemPrompt: z.string().optional(),
  onboardingStep: z.string().optional(), // e.g. 'NAME', 'PIN', 'BANK', 'TONE', 'COMPLETE'
  onboardingData: OnboardingDataSchema.optional(), // Temporary storage for setup data
  entityDef: EntityDefinitionSchema.optional(), // Dynamic schema for entities (e.g. Products, Patients)
  pendingSetup: z.object({
    phoneId: z.string(),
    accessToken: z.string(),
    wabaId: z.string().optional(),
    initiatedAt: z.string()
  }).optional().nullable(),
  config: ConfigSchema.optional(),
  updatedAt: FirestoreTimestampSchema,
});

export type Organization = z.infer<typeof OrganizationSchema>;
