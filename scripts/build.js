const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Function to get dependencies from a package.json
function getDependencies(packageJsonPath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return Object.keys(pkg.dependencies || {});
  } catch (e) {
    console.warn(`⚠️ Could not read ${packageJsonPath}: ${e.message}`);
    return [];
  }
}

async function build(appName, entryPath, outPath) {
  console.log(`\n🔨 Building ${appName}...`);

  const packageJsonPath = path.join(process.cwd(), appName, 'package.json');
  const allDeps = getDependencies(packageJsonPath);

  // CRITICAL: We want to bundle local packages (@naija-agent/*) but keep external ones external
  const externals = allDeps.filter(dep => !dep.startsWith('@naija-agent/'));

  console.log(`📦 Externalizing ${externals.length} packages (e.g., fastify, firebase-admin)`);
  console.log(`🔗 Bundling local packages: @naija-agent/*`);

  try {
    await esbuild.build({
      entryPoints: [path.join(process.cwd(), entryPath)],
      outfile: path.join(process.cwd(), outPath),
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'esm', // Output ESM to match package.json type: "module"
      external: externals,
      sourcemap: true,
      logLevel: 'info',
    });
    console.log(`✅ ${appName} built successfully!`);
  } catch (e) {
    console.error(`❌ Build failed for ${appName}:`, e);
    process.exit(1);
  }
}

async function main() {
  console.log("🚀 Starting Monorepo Bundle Build...");
  
  // Build API
  await build('apps/api', 'apps/api/src/index.ts', 'apps/api/dist/index.js');
  
  // Build Worker
  await build('apps/worker', 'apps/worker/src/index.ts', 'apps/worker/dist/index.js');
  
  console.log("\n🎉 All apps bundled successfully!");
}

main();
