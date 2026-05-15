import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

async function pushSchema() {
  console.log('🚀 Connecting to TiDB to push schema...');
  const connection = await mysql.createConnection({
      host: 'gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com',
      user: 'XML8UYyKecVnD6t.root',
      password: 'KuOTQZBWWQwzq4uw',
      database: 'test',
      port: 4000,
      ssl: {
        ca: fs.readFileSync('./packages/database/isrgrootx1.pem'),
      },
      multipleStatements: true
  });

  try {
    const sqlPath = path.resolve('./packages/database/drizzle/0001_smart_colleen_wing.sql');
    let sqlStatements = fs.readFileSync(sqlPath, 'utf8');
    
    // Strip drizzle specific breakpoint comments
    sqlStatements = sqlStatements.replace(/--> statement-breakpoint/g, '');
    
    console.log(`📜 Executing SQL Migration: ${sqlPath}`);
    await connection.query(sqlStatements);
    console.log('✅ Schema pushed successfully!');
    
  } catch (err) {
    console.error('❌ Failed to push schema:', err.message);
  } finally {
    await connection.end();
  }
}

pushSchema();