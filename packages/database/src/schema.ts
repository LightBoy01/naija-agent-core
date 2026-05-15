import { 
  mysqlTable, 
  varchar, 
  text, 
  bigint, 
  timestamp, 
  boolean, 
  json, 
  decimal 
} from 'drizzle-orm/mysql-core';

// --- Organizations (Tenants) ---
export const organizations = mysqlTable('organizations', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  balanceKobo: bigint('balance_kobo', { mode: 'number' }).default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  region: varchar('region', { length: 10 }).default('NG').notNull(),
  sector: varchar('sector', { length: 50 }).default('commerce').notNull(),
  whatsappPhoneId: varchar('whatsapp_phone_id', { length: 100 }),
  timezone: varchar('timezone', { length: 50 }).default('Africa/Lagos').notNull(),
  config: json('config'),
  systemPrompt: text('system_prompt'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

// --- User Profiles (Life OS Users) ---
export const users = mysqlTable('users', {
  phone: varchar('phone', { length: 20 }).primaryKey(), // Primary key is the E.164 phone number
  name: varchar('name', { length: 255 }),
  energyCredits: bigint('energy_credits', { mode: 'number' }).default(100).notNull(),
  vaultBalanceNaira: decimal('vault_balance_naira', { precision: 20, scale: 2 }).default('0.00').notNull(),
  pinHash: varchar('pin_hash', { length: 255 }), // Salted Bcrypt
  pinLockUntil: timestamp('pin_lock_until'),
  pinAttempts: bigint('pin_attempts', { mode: 'number' }).default(0).notNull(),
  context: json('context'), // Goals, Preferences, Family, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

// --- Transactions (Financial Ledger) ---
export const transactions = mysqlTable('transactions', {
  id: varchar('id', { length: 128 }).primaryKey(),
  userId: varchar('user_id', { length: 20 }).references(() => users.phone),
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id),
  type: varchar('type', { length: 50 }).notNull(), // 'deposit', 'withdrawal', 'vending', 'conversion'
  amount: decimal('amount', { precision: 20, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).default('NGN').notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // 'pending', 'success', 'failed', 'refunded'
  reference: varchar('reference', { length: 255 }).unique(), // Gateway Ref
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Semantic Memory (Long-term Facts) ---
export const memories = mysqlTable('memories', {
  id: varchar('id', { length: 128 }).primaryKey(),
  userId: varchar('user_id', { length: 20 }).references(() => users.phone),
  orgId: varchar('org_id', { length: 64 }).references(() => organizations.id),
  category: varchar('category', { length: 50 }).notNull(), // 'fact', 'preference', 'episodic'
  content: text('content').notNull(),
  embedding: text('embedding'), // Store vector as text for now (TiDB Vector support pending)
  importance: bigint('importance', { mode: 'number' }).default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Referrals (Growth Loop) ---
export const referrals = mysqlTable('referrals', {
  id: varchar('id', { length: 128 }).primaryKey(),
  referrerPhone: varchar('referrer_phone', { length: 20 }).references(() => users.phone).notNull(),
  referredPhone: varchar('referred_phone', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // 'pending', 'completed', 'rewarded'
  rewardAmount: bigint('reward_amount', { mode: 'number' }).default(50).notNull(), // Energy Credits
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});
