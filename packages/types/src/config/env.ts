import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // PostgreSQL
  DATABASE_URL: z.string().url(),

  // Redis (at least one URL must work)
  REDIS_URL: z.string().url().optional(),
  REDIS_URL_LOS: z.string().url().optional(),

  // Gemini / AI Keys (at least one variant must be set)
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY_STUDIO: z.string().min(1).optional(),
  GEMINI_API_KEY_LOS: z.string().min(1).optional(),

  // WhatsApp
  WHATSAPP_APP_SECRET: z.string().min(1),
  WHATSAPP_API_TOKEN: z.string().min(1).optional(),
  WHATSAPP_PHONE_ID: z.string().min(1).optional(),

  // Payments
  PAYSTACK_SECRET_KEY: z.string().min(1).optional(),
  PAYSTACK_PUBLIC_KEY: z.string().min(1).optional(),
  MONNIFY_SECRET_KEY: z.string().min(1).optional(),
  MONNIFY_API_KEY: z.string().min(1).optional(),
  MONNIFY_CONTRACT_CODE: z.string().min(1).optional(),

  // API Security
  API_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  SIDECAR_API_KEY: z.string().min(1).optional(),

  // Model overrides (optional)
  GEMINI_MODEL_LOS: z.string().min(1).optional(),

  // Web dashboard URL (for CORS)
  WEB_DASHBOARD_URL: z.string().url().optional(),

  // Feature flags
  DISABLE_BILLING: z.string().optional(),

  // Object storage (optional)
  CLOUDFLARE_R2_ACCOUNT_ID: z.string().min(1).optional(),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  CLOUDFLARE_R2_BUCKET: z.string().min(1).optional(),

  // Firebase (for legacy/transitional use)
  FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().min(1).optional(),
}).refine(
  (env) => env.GEMINI_API_KEY || env.GEMINI_API_KEY_STUDIO || env.GEMINI_API_KEY_LOS,
  { message: 'At least one GEMINI_API_KEY variant (GEMINI_API_KEY, GEMINI_API_KEY_STUDIO, or GEMINI_API_KEY_LOS) must be set' },
).refine(
  (env) => env.REDIS_URL || env.REDIS_URL_LOS,
  { message: 'At least one Redis URL (REDIS_URL or REDIS_URL_LOS) must be set' },
);

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ [CRITICAL] Invalid or missing environment variables:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }
  return result.data;
}
