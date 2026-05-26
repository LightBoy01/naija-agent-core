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

  const sql = postgres(DATABASE_URL);

  try {
    const rows = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log('Existing Tables (PostgreSQL):', rows.map((r: any) => r.table_name));
  } catch (error) {
    console.error('❌ Error inspecting DB:', error);
  } finally {
    await sql.end();
  }
}

main();