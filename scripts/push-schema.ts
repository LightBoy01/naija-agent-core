import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
const caPath = path.resolve(__dirname, '../packages/database/isrgrootx1.pem');

async function main() {
  console.log('Connecting to TiDB...');
  const pool = mysql.createPool({
    uri: DATABASE_URL,
    ssl: {
      ca: fs.readFileSync(caPath)
    }
  });

  try {
    console.log('Creating cron_jobs table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        id varchar(128) NOT NULL,
        user_id varchar(20) NOT NULL,
        org_id varchar(64) NOT NULL,
        name varchar(255) NOT NULL,
        instruction text NOT NULL,
        schedule varchar(100) NOT NULL,
        sector_pack varchar(50) NOT NULL DEFAULT 'ResearchPack',
        status varchar(20) NOT NULL DEFAULT 'active',
        energy_budget bigint NOT NULL DEFAULT 5,
        last_run_at timestamp NULL,
        next_run_at timestamp NULL,
        last_result text,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY cron_jobs_user_id_idx (user_id),
        KEY cron_jobs_org_id_idx (org_id),
        KEY cron_jobs_status_next_run_idx (status, next_run_at),
        CONSTRAINT cron_jobs_user_id_fk FOREIGN KEY (user_id) REFERENCES users (phone),
        CONSTRAINT cron_jobs_org_id_fk FOREIGN KEY (org_id) REFERENCES organizations (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
    `);

    console.log('✅ Successfully created cron_jobs table!');
  } catch (error) {
    console.error('❌ Failed to execute migration:', error);
  } finally {
    await pool.end();
  }
}

main();