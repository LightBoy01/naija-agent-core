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
  const pool = mysql.createPool({
    uri: DATABASE_URL,
    ssl: {
      ca: fs.readFileSync(caPath)
    }
  });

  try {
    const [rows]: any = await pool.query('SHOW TABLES');
    console.log('Existing Tables:', rows.map((r: any) => Object.values(r)[0]));
  } catch (error) {
    console.error('❌ Error inspecting DB:', error);
  } finally {
    await pool.end();
  }
}

main();