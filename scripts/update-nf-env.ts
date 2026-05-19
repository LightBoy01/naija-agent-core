
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in local .env');
  process.exit(1);
}

const services = ['naija-agent-workers'];
const projectId = 'naija-agent-core';

for (const serviceId of services) {
  console.log(`📡 Updating environment for ${serviceId}...`);
  
  try {
    // 1. Get current environment
    const currentEnvJson = execSync(`northflank get service runtime-environment --projectId ${projectId} --serviceId ${serviceId} --output json`).toString();
    const envData = JSON.parse(currentEnvJson);
    
    // 2. Add DATABASE_URL
    envData.runtimeEnvironment.DATABASE_URL = DATABASE_URL;
    
    // 3. Update Northflank
    const inputJson = JSON.stringify(envData);
    execSync(`northflank update service runtime-environment --projectId ${projectId} --serviceId ${serviceId} --input '${inputJson}'`);
    
    console.log(`✅ Successfully updated ${serviceId}`);
  } catch (error: any) {
    console.error(`❌ Failed to update ${serviceId}:`, error.message);
  }
}
