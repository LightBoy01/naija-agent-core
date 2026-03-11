const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build(appName, entryPath, outPath) {
  console.log(`
🔨 Building ${appName} to CommonJS (.js)...`);

  // --- SOVEREIGN BUNDLING STRATEGY (CJS REVERT) ---
  // CommonJS is more stable for bundling legacy dynamic requires 
  // found in bullmq and firebase-admin.
  const external = [
    'bcrypt',
    'path', 'fs', 'os', 'crypto', 'child_process', 'http', 'https',
    'zlib', 'events', 'util', 'stream', 'url', 'net', 'tls', 'dns', 'perf_hooks'
  ];

  try {
    await esbuild.build({
      entryPoints: [path.join(process.cwd(), entryPath)],
      outfile: path.join(process.cwd(), outPath),
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      sourcemap: true,
      logLevel: 'info',
      external: external,
      // CRITICAL: Point to SOURCE instead of DIST to avoid the "dist/index.js not found" error
      alias: {
        '@naija-agent/types': path.resolve(process.cwd(), 'packages/types/src/index.ts'),
        '@naija-agent/firebase': path.resolve(process.cwd(), 'packages/firebase/src/index.ts'),
        '@naija-agent/payments': path.resolve(process.cwd(), 'packages/payments/src/index.ts'),
        '@naija-agent/storage': path.resolve(process.cwd(), 'packages/storage/src/index.ts'),
        '@naija-agent/logistics': path.resolve(process.cwd(), 'packages/logistics/src/index.ts'),
      },
    });
    console.log(`✅ ${appName} built successfully!`);
  } catch (e) {
    console.error(`❌ Build failed for ${appName}:`, e);
    process.exit(1);
  }
}

async function main() {
  console.log("🚀 Starting Monorepo Bundle Build...");
  
  // --- MONOREPO LINKING PROTECTION ---
  // Ensure dist/ folders exist for local packages so npm ci links don't break
  const packages = ['types', 'firebase', 'payments', 'storage', 'logistics'];
  for (const pkg of packages) {
    const distPath = path.join(process.cwd(), `packages/${pkg}/dist`);
    if (!fs.existsSync(distPath)) {
      console.log(`📁 Creating placeholder dist for @naija-agent/${pkg}...`);
      fs.mkdirSync(distPath, { recursive: true });
      fs.writeFileSync(path.join(distPath, 'index.js'), '// placeholder');
    }
  }

  // Build API to .js
  await build('apps/api', 'apps/api/src/index.ts', 'apps/api/dist/index.js');
  
  // Build Worker to .js
  await build('apps/worker', 'apps/worker/src/index.ts', 'apps/worker/dist/index.js');
  
  console.log("\n🎉 All apps bundled successfully!");
}

main();
