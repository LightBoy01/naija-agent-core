import { db } from './db.js';
export { db };
export const getDb = () => db;

export * from './modules/content.js';
export * from './modules/products.js';
export * from './modules/activities.js';
export * from './modules/ledger.js';
export * from './modules/onboarding.js';
export * from './modules/orgs.js';
export * from './modules/stats.js';
export * from './modules/billing.js';
export * from './modules/topup.js';
export * from './modules/chats.js';
export * from './modules/fraud.js';
export * from './modules/auth.js';
export * from './modules/media.js';

export type { 
  Config, 
  PaymentConfig, 
  StaffData, 
  OnboardingConfig, 
  OnboardingData,
  Organization, 
  Message,
  TransactionData,
  FirestoreTimestamp,
  Product,
  Activity,
  Chat
} from '@naija-agent/types';
