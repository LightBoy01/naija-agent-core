const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'production';

async function build(appName, entryPath, outPath) {
  console.log(`
🔨 Building ${appName} to CommonJS (.js)...`);

  // --- SOVEREIGN BUNDLING STRATEGY (CJS REVERT) ---
  // CommonJS is more stable for bundling legacy dynamic requires 
  // found in bullmq and firebase-admin.
  const external = [
    'bcrypt', 'bullmq', 'pino', 'pino-pretty',
    'path', 'fs', 'os', 'crypto', 'child_process', 'http', 'https',
    'zlib', 'events', 'util', 'stream', 'url', 'net', 'tls', 'dns', 'perf_hooks'
  ];

  // Ensure output directory exists
  const outDir = path.dirname(path.join(process.cwd(), outPath));
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

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

const { execSync } = require('child_process');

async function main() {
  console.log("🚀 Starting Monorepo Bundle Build...");
  
  // --- MONOREPO PACKAGES BUILDING ---
  // Compile all packages together to save memory (Termux OOM fix)
  console.log(`🔨 Compiling all packages via TypeScript Project References...`);
  try {
    execSync('npx tsc -b packages/types packages/firebase packages/payments packages/storage packages/logistics', { stdio: 'inherit' });
  } catch (e) {
    console.error(`❌ Package compilation failed`);
    process.exit(1);
  }

  // Build API to .js
  await build('apps/api', 'apps/api/src/index.ts', 'apps/api/dist/index.js');
  
  // Build Worker to .js
  await build('apps/worker', 'apps/worker/src/index.ts', 'apps/worker/dist/index.js');

  // Build Life OS Worker to .js
  await build('apps/worker-life', 'apps/worker-life/src/index.ts', 'apps/worker-life/dist/index.js');
  
  // Ensure static assets like mcp-fetch.mjs are copied
  const mcpFetchSrc = path.join(process.cwd(), 'apps/worker-life/src/utils/mcp-fetch.mjs');
  const mcpFetchDestDir = path.join(process.cwd(), 'apps/worker-life/dist/utils');
  if (fs.existsSync(mcpFetchSrc)) {
    if (!fs.existsSync(mcpFetchDestDir)) {
      fs.mkdirSync(mcpFetchDestDir, { recursive: true });
    }
    fs.copyFileSync(mcpFetchSrc, path.join(mcpFetchDestDir, 'mcp-fetch.mjs'));
    console.log('✅ Copied mcp-fetch.mjs to apps/worker-life/dist/utils');
  }

  // Ensure prompts are copied
  const promptsSrcDir = path.join(process.cwd(), 'apps/worker-life/src/prompts');
  const promptsDestDir = path.join(process.cwd(), 'apps/worker-life/dist/prompts');
  if (fs.existsSync(promptsSrcDir)) {
    if (!fs.existsSync(promptsDestDir)) {
      fs.mkdirSync(promptsDestDir, { recursive: true });
    }
    fs.readdirSync(promptsSrcDir).forEach(file => {
      fs.copyFileSync(path.join(promptsSrcDir, file), path.join(promptsDestDir, file));
    });
    console.log('✅ Copied prompts to apps/worker-life/dist/prompts');
  }
  
  console.log("\n🎉 All apps bundled successfully!");
}

main();
