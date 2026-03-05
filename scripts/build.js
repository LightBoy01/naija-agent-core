const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Function to collect all dependencies from the entire monorepo
function getAllDependencies() {
  const deps = new Set();
  const packagePaths = [
    'package.json',
    'apps/api/package.json',
    'apps/worker/package.json',
    'packages/firebase/package.json',
    'packages/types/package.json'
  ];

  packagePaths.forEach(p => {
    try {
      const fullPath = path.join(process.cwd(), p);
      if (fs.existsSync(fullPath)) {
        const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        Object.keys(pkg.dependencies || {}).forEach(d => deps.add(d));
      }
    } catch (e) {
      console.warn(`⚠️ Warning: Could not read ${p}`);
    }
  });

  return Array.from(deps).filter(d => !d.startsWith('@naija-agent/'));
}

async function build(appName, entryPath, outPath) {
  console.log(`
🔨 Building ${appName} to ESM (.mjs)...`);

  const externals = getAllDependencies();

  console.log(`📦 Externalizing ${externals.length} packages (e.g., fastify, firebase-admin)`);
  console.log(`🔗 Bundling local packages: @naija-agent/*`);

  try {
    await esbuild.build({
      entryPoints: [path.join(process.cwd(), entryPath)],
      outfile: path.join(process.cwd(), outPath),
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      external: externals,
      sourcemap: true,
      logLevel: 'info',
      // CRITICAL: Point to SOURCE instead of DIST to avoid the "dist/index.js not found" error
      alias: {
        '@naija-agent/types': path.resolve(process.cwd(), 'packages/types/src/index.ts'),
        '@naija-agent/firebase': path.resolve(process.cwd(), 'packages/firebase/src/index.ts'),
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
  
  // Build API to .mjs
  await build('apps/api', 'apps/api/src/index.ts', 'apps/api/dist/index.mjs');
  
  // Build Worker to .mjs
  await build('apps/worker', 'apps/worker/src/index.ts', 'apps/worker/dist/index.mjs');
  
  console.log("\n🎉 All apps bundled successfully!");
}

main();
