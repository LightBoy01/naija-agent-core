import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Fix for ESM/CJS interop for firebase-admin
const firebaseAdmin = (admin as any).default || admin;

// Fix for __dirname in ESM/CJS transition
const _dirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

// Load .env
const envPaths = [
  path.join(_dirname, '../../.env'),
  path.join(_dirname, '../../../.env'),
  path.join(process.cwd(), '.env')
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

// Initialize Firebase Admin
if (!firebaseAdmin.apps.length) {
  let credential;
  const localKeyPath = path.join(_dirname, '../serviceAccountKey.json');
  const localKeyPathDist = path.join(_dirname, '../../serviceAccountKey.json');
  const directCwdPath = path.resolve(process.cwd(), 'packages/firebase/serviceAccountKey.json');
  const directCwdPathAlt = path.resolve(process.cwd(), '../../packages/firebase/serviceAccountKey.json');
  
  let rootSearch = _dirname;
  let rootFound = "";
  for (let i = 0; i < 6; i++) {
    const pkgPath = path.join(rootSearch, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkgStr = fs.readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(pkgStr);
        if (pkg.workspaces) {
          rootFound = rootSearch;
          break;
        }
      } catch (e) {}
    }
    const nextSearch = path.dirname(rootSearch);
    if (nextSearch === rootSearch) break;
    rootSearch = nextSearch;
  }
  
  const projectRootPath = rootFound ? path.join(rootFound, 'packages/firebase/serviceAccountKey.json') : "";

  if (fs.existsSync(localKeyPath)) {
    credential = firebaseAdmin.credential.cert(localKeyPath);
  } else if (fs.existsSync(localKeyPathDist)) {
    credential = firebaseAdmin.credential.cert(localKeyPathDist);
  } else if (fs.existsSync(directCwdPath)) {
    credential = firebaseAdmin.credential.cert(directCwdPath);
  } else if (fs.existsSync(directCwdPathAlt)) {
    credential = firebaseAdmin.credential.cert(directCwdPathAlt);
  } else if (projectRootPath && fs.existsSync(projectRootPath)) {
    credential = firebaseAdmin.credential.cert(projectRootPath);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try {
      const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
      const serviceAccount = JSON.parse(decoded);
      credential = firebaseAdmin.credential.cert(serviceAccount);
    } catch (e) {}
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      const startIndex = raw.indexOf('{');
      const jsonStr = startIndex === -1 ? raw.replace(/[^\x00-\x7F]/g, "") : raw.substring(startIndex).replace(/[^\x00-\x7F]/g, "");
      const serviceAccount = JSON.parse(jsonStr);
      credential = firebaseAdmin.credential.cert(serviceAccount);
    } catch (e) {}
  }

  if (credential) {
    firebaseAdmin.initializeApp({
      credential,
      projectId: process.env.FIREBASE_PROJECT_ID || 'naija-agent-core',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'naija-agent-core.firebasestorage.app'
    });
  } else {
    // throw new Error('[FIREBASE_INIT_ERROR] Credential could not be initialized.');
    console.warn('[FIREBASE_INIT_WARN] Firebase initialized without credentials (Read-only/Public mode).');
    firebaseAdmin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'naija-agent-core'
    });
  }
}

// Global state to track if settings were applied
const globalSymbol = Symbol.for('firebase.firestore.settings_applied');
export const db = getFirestore();

if (!(global as any)[globalSymbol]) {
    try {
        db.settings({ ignoreUndefinedProperties: true });
        (global as any)[globalSymbol] = true;
    } catch (e) {
        // Silently fail if settings already applied by another module/import
        (global as any)[globalSymbol] = true;
    }
}
