import { 
  pgTable, 
  varchar, 
  text, 
  bigint, 
  timestamp, 
  boolean, 
  jsonb, 
  decimal,
  integer
} from 'drizzle-orm/pg-core';

// --- Organizations (Tenants) ---
export const organizations = pgTable('organizations', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  balanceKobo: bigint('balance_kobo', { mode: 'number' }).default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  region: varchar('region', { length: 10 }).default('NG').notNull(),
  sector: varchar('sector', { length: 50 }).default('commerce').notNull(),
  whatsappPhoneId: varchar('whatsapp_phone_id', { length: 100 }),
  proxyUrl: varchar('proxy_url', { length: 255 }), // SOCKS5/HTTP proxy for this tenant
  timezone: varchar('timezone', { length: 50 }).default('Africa/Lagos').notNull(),
  config: jsonb('config'),
  systemPrompt: text('system_prompt'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- User Profiles (Life OS Users) ---
export const users = pgTable('users', {
  phone: varchar('phone', { length: 20 }).primaryKey(), // Primary key is the E.164 phone number
  name: varchar('name', { length: 255 }),
  energyCredits: integer('energy_credits').default(100).notNull(),
  vaultBalanceNaira: decimal('vault_balance_naira', { precision: 20, scale: 2 }).default('0.00').notNull(),
  pinHash: varchar('pin_hash', { length: 255 }), // Salted Bcrypt
  pinLockUntil: timestamp('pin_lock_until'),
  pinAttempts: integer('pin_attempts').default(0).notNull(),
  context: jsonb('context'), // Goals, Preferences, Family, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- Transactions (Financial Ledger) ---
export const transactions = pgTable('transactions', {
  id: varchar('id', { length: 128 }).primaryKey(),
  userId: varchar('user_id', { length: 20 }).references(() => users.phone),
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id),
  type: varchar('type', { length: 50 }).notNull(), // 'deposit', 'withdrawal', 'vending', 'conversion'
  amount: decimal('amount', { precision: 20, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).default('NGN').notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // 'pending', 'success', 'failed', 'refunded'
  reference: varchar('reference', { length: 255 }).unique(), // Gateway Ref
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Semantic Memory (Long-term Facts) ---
export const memories = pgTable('memories', {
  id: varchar('id', { length: 128 }).primaryKey(),
  userId: varchar('user_id', { length: 20 }).references(() => users.phone),
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id),
  category: varchar('category', { length: 50 }).notNull(), // 'fact', 'preference', 'episodic'
  content: text('content').notNull(),
  embedding: text('embedding'), // Store vector as text for now
  importance: integer('importance').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Referrals (Growth Loop) ---
export const referrals = pgTable('referrals', {
  id: varchar('id', { length: 128 }).primaryKey(),
  referrerPhone: varchar('referrer_phone', { length: 20 }).references(() => users.phone).notNull(),
  referredPhone: varchar('referred_phone', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // 'pending', 'completed', 'rewarded'
  rewardAmount: integer('reward_amount').default(50).notNull(), // Energy Credits
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// --- Chats (Conversation State) ---
export const chats = pgTable('chats', {
  id: varchar('id', { length: 128 }).primaryKey(), // e.g., 'orgId_userPhone' or 'userPhone_life'
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id),
  userPhone: varchar('user_phone', { length: 20 }), // We don't strictly reference users.phone yet to allow un-profiled users
  userName: varchar('user_name', { length: 255 }),
  isOptedOut: boolean('is_opted_out').default(false).notNull(),
  isCartActive: boolean('is_cart_active').default(false).notNull(),
  lastCartUpdateAt: timestamp('last_cart_update_at'),
  lastNudgeAt: timestamp('last_nudge_at'),
  lastMessageAt: timestamp('last_message_at'),
  summary: varchar('summary', { length: 255 }),
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
  reasoning: text('reasoning'), // Stores the <think> tags from DeepSeek
  metadata: jsonb('metadata'), // Can store media IDs or function call args
  createdAt: timestamp('created_at').defaultNow().notNull(),
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
  userId: varchar('user_id', { length: 20 }).references(() => users.phone).notNull(),
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(), // User-friendly name (e.g., 'Visa Monitor')
  instruction: text('instruction').notNull(), // The raw prompt/goal for the Hermes worker
  schedule: varchar('schedule', { length: 100 }).notNull(), // Cron expression (e.g., '0 8 * * *')
  sectorPack: varchar('sector_pack', { length: 50 }).default('ResearchPack').notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(), // 'active', 'paused', 'completed', 'failed'
  energyBudget: integer('energy_budget').default(5).notNull(), // Max credits per run
  lastRunAt: timestamp('last_run_at'),
  nextRunAt: timestamp('next_run_at'),
  lastResult: text('last_result'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
