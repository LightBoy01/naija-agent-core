import { getNetworkStats } from '../packages/firebase/src/index';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  const stats = await getNetworkStats();
  console.log(JSON.stringify(stats, null, 2));
}

run().catch(console.error);
