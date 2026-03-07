const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build(appName, entryPath, outPath) {
  console.log(`
🔨 Building ${appName} to ESM (.mjs)...`);

  // Plugin to externalize ALL dependencies except @naija-agent/*
  const externalizeDepsPlugin = {
    name: 'externalize-deps',
    setup(build) {
      build.onResolve({ filter: /^[^.{}/]/ }, (args) => {
        // If it's one of our local packages, let esbuild bundle it (using the alias)
        if (args.path.startsWith('@naija-agent/')) {
          return null; 
        }
        // Otherwise, mark it as external (e.g., fastify, firebase-admin, bullmq)
        return { path: args.path, external: true };
      });
    },
  };

  try {
    await esbuild.build({
      entryPoints: [path.join(process.cwd(), entryPath)],
      outfile: path.join(process.cwd(), outPath),
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      sourcemap: true,
      logLevel: 'info',
      plugins: [externalizeDepsPlugin],
      // CRITICAL: Point to SOURCE instead of DIST to avoid the "dist/index.js not found" error
      alias: {
        '@naija-agent/types': path.resolve(process.cwd(), 'packages/types/src/index.ts'),
        '@naija-agent/firebase': path.resolve(process.cwd(), 'packages/firebase/src/index.ts'),
        '@naija-agent/payments': path.resolve(process.cwd(), 'packages/payments/src/index.ts'),
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
