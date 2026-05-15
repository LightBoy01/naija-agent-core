import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export default {
  schema: './src/schema.ts',
  out: './drizzle',
  driver: 'mysql2',
  dbCredentials: {
    host: 'gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com',
    user: 'XML8UYyKecVnD6t.root',
    password: 'KuOTQZBWWQwzq4uw',
    database: 'test',
    port: 4000,
    ssl: {
      ca: fs.readFileSync(path.resolve(__dirname, 'isrgrootx1.pem')),
    }
  },
} satisfies Config;
