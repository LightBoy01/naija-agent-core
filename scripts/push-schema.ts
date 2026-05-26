import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set');
    return;
  }

  console.log('Connecting to PostgreSQL...');
  const sql = postgres(DATABASE_URL);

  try {
    console.log('Creating cron_jobs table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        id varchar(128) NOT NULL PRIMARY KEY,
        user_id varchar(20) NOT NULL REFERENCES users(phone),
        org_id varchar(64) NOT NULL REFERENCES organizations(id),
        name varchar(255) NOT NULL,
        instruction text NOT NULL,
        schedule varchar(100) NOT NULL,
        sector_pack varchar(50) NOT NULL DEFAULT 'ResearchPack',
        status varchar(20) NOT NULL DEFAULT 'active',
        energy_budget integer NOT NULL DEFAULT 5,
        last_run_at timestamp NULL,
        next_run_at timestamp NULL,
        last_result text,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes separately for PostgreSQL
    console.log('Creating indexes...');
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS cron_jobs_user_id_idx ON cron_jobs (user_id);`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS cron_jobs_org_id_idx ON cron_jobs (org_id);`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS cron_jobs_status_next_run_idx ON cron_jobs (status, next_run_at);`);

    console.log('✅ Successfully created cron_jobs table and indexes!');
  } catch (error) {
    console.error('❌ Failed to execute migration:', error);
  } finally {
    await sql.end();
  }
}

main();