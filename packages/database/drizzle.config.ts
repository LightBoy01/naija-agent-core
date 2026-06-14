import type { Config } from 'drizzle-kit';
import path from 'path';

export default {
  schema: './src/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || '',
  },
  tablesFilter: ["!whatsmeow_*"],
} satisfies Config;
