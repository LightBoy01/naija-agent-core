const fs = require('fs');
const path = require('path');

const OLD_NUM = '2349015772541';
const NEW_NUM = '2347072139935';
const ROOT = '/data/data/com.termux/files/home/naija-agent-core';

const filesToUpdate = [
  'apps/api/.env',
  'apps/worker/src/pipeline/interceptors/org-load.ts',
  'apps/worker/test/unit/whatsapp.test.ts',
  'apps/worker-life/test/unit/whatsapp.test.ts',
  'packages/types/src/config/index.ts',
  'scripts/map-bots-correct.js',
  'scripts/seed-firebase.js',
  'scripts/simulate-whatsapp.js',
  'scripts/sql/resolve_split_brain.sql',
  'scripts/sql/restore.sql',
  'scripts/fix_firebase_routing.mjs',
  'scripts/map-bots.js',
  '.env'
];

for (const file of filesToUpdate) {
  const filePath = path.join(ROOT, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(OLD_NUM)) {
      content = content.split(OLD_NUM).join(NEW_NUM);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated: ${file}`);
    }
  }
}
