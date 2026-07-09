import type { Config } from 'drizzle-kit';
import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

export default {
  schema: './src/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || '',
  },
  tablesFilter: ["!whatsmeow_*"],
} satisfies Config;
