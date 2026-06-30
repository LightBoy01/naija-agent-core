import { 
  pgTable, 
  varchar, 
  text, 
  bigint, 
  timestamp, 
  boolean, 
  jsonb, 
  decimal,
  integer,
  customType,
  primaryKey,
  index
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// --- Custom Types ---
export const vector = customType<{
  data: number[];
  driverData: string;
}>({
  dataType() {
    return 'vector'; // Dimension is omitted to bypass Drizzle quoting bugs. Postgres will accept any dimension.
  },
  toDriver(value: number[]): string {
    if (!Array.isArray(value)) return '[]';
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .slice(1, -1)
      .split(',')
      .map((v) => parseFloat(v));
  },
});

// --- Beta Feedback ---
export const betaFeedback = pgTable('beta_feedback', {
  id: varchar('id', { length: 64 }).primaryKey(),
  orgId: varchar('org_id', { length: 64 }).notNull(),
  userPhone: varchar('user_phone', { length: 64 }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Organizations (Tenants) ---
export const organizations = pgTable('organizations', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  balanceKobo: bigint('balance_kobo', { mode: 'number' }).default(0).notNull(),
  lifetimeDepositsKobo: bigint('lifetime_deposits_kobo', { mode: 'number' }).default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  status: varchar('status', { length: 50 }).default('ACTIVE').notNull(), // 'ACTIVE', 'SUSPENDED', 'TRIAL', etc.
  region: varchar('region', { length: 10 }).default('NG').notNull(),
  sector: varchar('sector', { length: 50 }).default('commerce').notNull(),
  deploymentModel: varchar('deployment_model', { length: 50 }).default('SHARED').notNull(), // 'SHARED', 'DEDICATED'
  costPerReply: integer('cost_per_reply').default(3300).notNull(), // Kobo
  whatsappPhoneId: varchar('whatsapp_phone_id', { length: 100 }),
  proxyUrl: varchar('proxy_url', { length: 255 }), // SOCKS5/HTTP proxy for this tenant
  timezone: varchar('timezone', { length: 50 }).default('Africa/Lagos').notNull(),
  onboardingStep: varchar('onboarding_step', { length: 50 }).default('NONE').notNull(),
  onboardingData: jsonb('onboarding_data'),
  systemPrompt: text('system_prompt'),
  config: jsonb('config'),
  trialStartedAt: timestamp('trial_started_at'),
  isBetaPartner: boolean('is_beta_partner').default(false).notNull(),
  isBetaCohort: boolean('is_beta_cohort').default(false).notNull(),
  betaExpiresAt: timestamp('beta_expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- User Profiles (Life OS Users) ---
export const users = pgTable('users', {
  phone: varchar('phone', { length: 64 }).primaryKey(), // Primary key is the E.164 phone number
  name: varchar('name', { length: 255 }),
  energyCredits: integer('energy_credits').default(100).notNull(),
  vaultBalanceKobo: bigint('vault_balance_kobo', { mode: 'number' }).default(0).notNull(),
  pinHash: varchar('pin_hash', { length: 255 }), // Salted Bcrypt
  pinLockUntil: timestamp('pin_lock_until'),
  pinAttempts: integer('pin_attempts').default(0).notNull(),
  family: jsonb('family'),
  goals: jsonb('goals'),
  preferences: jsonb('preferences'),
  context: jsonb('context'), // Legacy catch-all for migration
  sessionStatus: varchar('session_status', { length: 50 }), // e.g. 'IDLE', 'AWAITING_PIN'
  sessionExpiry: timestamp('session_expiry'),
  activeAgent: varchar('active_agent', { length: 50 }).default('aelixxr').notNull(),
  hermesSessionId: varchar('hermes_session_id', { length: 128 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- Transactions (Financial Ledger) ---
export const transactions = pgTable('transactions', {
  id: varchar('id', { length: 128 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).references(() => users.phone),
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id),
  type: varchar('type', { length: 50 }).notNull(), // 'deposit', 'withdrawal', 'vending', 'conversion', 'topup'
  amount: decimal('amount', { precision: 20, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).default('NGN').notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // 'pending', 'success', 'failed', 'refunded'
  reference: varchar('reference', { length: 255 }).unique(), // Gateway Ref
  smsId: varchar('sms_id', { length: 128 }), // Link to incoming bridge SMS
  metadata: jsonb('metadata'),
  verifiedAt: timestamp('verified_at'),
  confirmedAt: timestamp('confirmed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Semantic Memory (Long-term Facts) ---
export const memories = pgTable('memories', {
  id: varchar('id', { length: 128 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).references(() => users.phone),
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id),
  category: varchar('category', { length: 50 }).notNull(), // 'fact', 'preference', 'episodic'
  content: text('content').notNull(),
  embedding: vector('embedding'), // Optimized vector storage
  importance: integer('importance').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: index('memories_user_id_idx').on(table.userId),
    // HNSW index for high-scale vector search (Cosine Distance)
    embeddingIdx: index('memories_embedding_idx').on(table.embedding),
  };
});

// --- Energy Ledger (Immutable Audit Trail for Credits) ---
export const energyLedger = pgTable('energy_ledger', {
  id: varchar('id', { length: 128 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).references(() => users.phone).notNull(),
  amount: integer('amount').notNull(), // positive = credit, negative = debit
  reason: varchar('reason', { length: 100 }).notNull(), // 'web_search', 'msg_reply', 'refund', 'topup', etc.
  balanceAfter: integer('balance_after').notNull(),
  reference: varchar('reference', { length: 255 }), // links to transactions.reference for topups
  jobId: varchar('job_id', { length: 128 }), // BullMQ job ID for traceability
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const referrals = pgTable('referrals', {
  id: varchar('id', { length: 128 }).primaryKey(),
  referrerPhone: varchar('referrer_phone', { length: 64 }).references(() => users.phone).notNull(),
  referredOrgId: varchar('referred_org_id', { length: 64 }).references(() => organizations.id).notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(), // 'active', 'expired'
  commissionEarnedKobo: bigint('commission_earned_kobo', { mode: 'number' }).default(0).notNull(), // Tracks total accumulated 30% RevShare
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'), // Exactly 365 days from activation
});

// --- Chats (Conversation State) ---
export const chats = pgTable('chats', {
  id: varchar('id', { length: 128 }).primaryKey(), // e.g., 'orgId_userPhone' or 'userPhone_life'
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id),
  userPhone: varchar('user_phone', { length: 64 }), // Increased to 64 to fit full WhatsApp JIDs like 28364215738456@lid_life
  userName: varchar('user_name', { length: 255 }),
  isOptedOut: boolean('is_opted_out').default(false).notNull(),
  isCartActive: boolean('is_cart_active').default(false).notNull(),
  lastCartUpdateAt: timestamp('last_cart_update_at'),
  lastAdminAuthAt: timestamp('last_admin_auth_at'),
  lastNudgeAt: timestamp('last_nudge_at'),
  lastMessageAt: timestamp('last_message_at'),
  summary: varchar('summary', { length: 255 }),
  activeDemoNiche: varchar('active_demo_niche', { length: 128 }),
  demoStartedAt: timestamp('demo_started_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- Chat Messages (Conversation History) ---
export const messages = pgTable('messages', {
  id: varchar('id', { length: 128 }).primaryKey(), // Usually a UUID
  chatId: varchar('chat_id', { length: 128 }).references(() => chats.id).notNull(), 
  role: varchar('role', { length: 20 }).notNull(), // 'user', 'assistant', 'system', 'function'
  content: text('content').notNull(),
  type: varchar('type', { length: 20 }).default('text').notNull(), // 'text', 'image', 'audio', etc.
  embedding: vector('embedding'), // Semantic search across history
  reasoning: text('reasoning'), // Stores the <think> tags from DeepSeek
  metadata: jsonb('metadata'), // Can store media IDs or function call args
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Products (Commerce Catalog) ---
export const products = pgTable('products', {
  id: varchar('id', { length: 128 }).primaryKey(),
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  nameLowercase: varchar('name_lowercase', { length: 255 }),
  description: text('description'),
  price: decimal('price', { precision: 20, scale: 2 }),
  stock: integer('stock').default(0).notNull(),
  reserved: integer('reserved').default(0).notNull(),
  lowStockThreshold: integer('low_stock_threshold').default(3).notNull(),
  isLowStock: boolean('is_low_stock').default(false).notNull(),
  metadata: jsonb('metadata'), // image URLs, variants, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    orgIdIdx: index('products_org_id_idx').on(table.orgId),
    lowStockIdx: index('products_low_stock_idx').on(table.isLowStock),
  };
});

// --- Activities (Bookings, Waybills, Operations) ---
export const activities = pgTable('activities', {
  id: varchar('id', { length: 128 }).primaryKey(),
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'booking', 'waybill'
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  summary: text('summary'),
  amount: decimal('amount', { precision: 20, scale: 2 }),
  customerPhone: varchar('customer_phone', { length: 64 }),
  assignedStaffPhone: varchar('assigned_staff_phone', { length: 64 }),
  metadata: jsonb('metadata'), // startTime, duration, reminder flags, cart items
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    orgIdIdx: index('activities_org_id_idx').on(table.orgId),
    customerPhoneIdx: index('activities_customer_phone_idx').on(table.customerPhone),
    typeStatusIdx: index('activities_type_status_idx').on(table.type, table.status),
  };
});

// --- Cart Items (Commerce) ---
export const cartItems = pgTable('cart_items', {
  id: varchar('id', { length: 128 }).primaryKey(),
  chatId: varchar('chat_id', { length: 128 }).references(() => chats.id).notNull(),
  productId: varchar('product_id', { length: 128 }).notNull(), // Link to Firestore product ID for now
  name: varchar('name', { length: 255 }).notNull(),
  price: decimal('price', { precision: 20, scale: 2 }).notNull(),
  quantity: integer('quantity').default(1).notNull(),
  addedAt: timestamp('added_at').defaultNow().notNull(),
});

// --- Sovereign Cron Jobs (Phase 3: Long-Running Autonomy) ---
export const cronJobs = pgTable('cron_jobs', {
  id: varchar('id', { length: 128 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).references(() => users.phone).notNull(),
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(), // User-friendly name (e.g., 'Visa Monitor')
  instruction: text('instruction').notNull(), // The raw prompt/goal for the Hermes worker
  schedule: varchar('schedule', { length: 100 }).notNull(), // Cron expression (e.g., '0 8 * * *')
  sector_pack: varchar('sector_pack', { length: 50 }).default('ResearchPack').notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(), // 'active', 'paused', 'completed', 'failed'
  energyBudget: integer('energy_budget').default(5).notNull(), // Max credits per run
  lastRunAt: timestamp('last_run_at'),
  nextRunAt: timestamp('next_run_at'),
  lastResult: text('last_result'),
  trajectory: jsonb('trajectory'), // Stores the Agent's "Chain of Thought" or progress steps
  stepCount: integer('step_count').default(0).notNull(), // To track progress across multiple hops
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- Global Fraud Registry (Phase 9.3: Scam-Shield) ---
export const fraudRegistry = pgTable('fraud_registry', {
  phoneHash: varchar('phone_hash', { length: 64 }).notNull(), // SHA-256 hash
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id).notNull(),
  reason: text('reason').notNull(),
  evidenceUrl: text('evidence_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.phoneHash, table.orgId] }),
  };
});

// --- IronClaw Vault (Secrets Management) ---
export const vaultSecrets = pgTable('vault_secrets', {
  id: varchar('id', { length: 128 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).references(() => users.phone).notNull(),
  serviceName: varchar('service_name', { length: 100 }).notNull(),
  credentials: jsonb('credentials').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- Heartbeats (Lightweight Deterministic Reminders) ---
export const heartbeats = pgTable('heartbeats', {
  id: varchar('id', { length: 128 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).references(() => users.phone).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'reminder', 'market', etc.
  query: varchar('query', { length: 255 }), // For polling configurations
  intervalDescription: varchar('interval_description', { length: 255 }),
  messagePayload: text('message_payload'),
  vaultTopic: varchar('vault_topic', { length: 100 }),
  triggerTime: bigint('trigger_time', { mode: 'number' }), // Unix timestamp for one-off reminders
  active: boolean('active').default(true).notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- Knowledge Base (RAG & Rules) ---
export const knowledge = pgTable('knowledge', {
  slug: varchar('slug', { length: 128 }).primaryKey(),
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id).notNull(),
  key: varchar('key', { length: 128 }).notNull(),
  content: text('content').notNull(),
  imageUrl: varchar('image_url', { length: 512 }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    orgIdIdx: index('knowledge_org_id_idx').on(table.orgId),
  };
});

// --- Staff Members ---
export const staff = pgTable('staff', {
  phone: varchar('phone', { length: 64 }).primaryKey(),
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    orgIdIdx: index('staff_org_id_idx').on(table.orgId),
  };
});

// --- System Logs (Audit Trail) ---
export const systemLogs = pgTable('system_logs', {
  id: varchar('id', { length: 128 }).primaryKey(),
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id).notNull(),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  summary: text('summary').notNull(),
  metadata: jsonb('metadata'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (table) => {
  return {
    orgIdIdx: index('system_logs_org_id_idx').on(table.orgId),
    eventTypeIdx: index('system_logs_event_type_idx').on(table.eventType),
  };
});

// --- Daily Snapshots (Analytics) ---
export const dailySnapshots = pgTable('daily_snapshots', {
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id).notNull(),
  date: varchar('date', { length: 20 }).notNull(), // 'YYYY-MM-DD'
  totalSalesKobo: bigint('total_sales_kobo', { mode: 'number' }).default(0).notNull(),
  totalExpensesKobo: bigint('total_expenses_kobo', { mode: 'number' }).default(0).notNull(),
  metadata: jsonb('metadata'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.orgId, table.date] }),
  };
});

// --- Network Metadata (Global Stats) ---
export const networkMetadata = pgTable('network_metadata', {
  key: varchar('key', { length: 50 }).primaryKey(), // e.g., 'global'
  totalVaultKobo: bigint('total_vault_kobo', { mode: 'number' }).default(0).notNull(),
  activeClients: integer('active_clients').default(0).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- Staging Products (Review Area) ---
export const stagingProducts = pgTable('staging_products', {
  id: varchar('id', { length: 128 }).primaryKey(),
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  nameLowercase: varchar('name_lowercase', { length: 255 }),
  description: text('description'),
  price: decimal('price', { precision: 20, scale: 2 }),
  stock: integer('stock').default(0).notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    orgIdIdx: index('staging_products_org_id_idx').on(table.orgId),
  };
});

// --- Sovereign Vault (Document Storage) ---
export const vaultDocuments = pgTable('vault_documents', {
  id: varchar('id', { length: 128 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).references(() => users.phone).notNull(),
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id),
  type: varchar('type', { length: 50 }).notNull(), // 'Receipt', 'Note', 'Identity_Doc', etc.
  title: varchar('title', { length: 255 }),
  summary: text('summary').notNull(),
  content: text('content'),
  extractedData: jsonb('extracted_data'),
  storageUrl: text('storage_url'),
  gcsUri: text('gcs_uri'),
  provider: varchar('provider', { length: 50 }), // 'gcs', 'cloudinary', 'cloudflare-r2'
  originalMediaId: varchar('original_media_id', { length: 255 }),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  caption: text('caption'),
  tags: jsonb('tags'),
  embedding: customType<{ data: number[] }>({
    dataType() { return 'vector(768)'; }
  })('embedding'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: index('vault_docs_user_id_idx').on(table.userId),
    typeIdx: index('vault_docs_type_idx').on(table.type),
  };
});

