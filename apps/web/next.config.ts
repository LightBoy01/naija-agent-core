import type { NextConfig } from "next";

import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["bcrypt"],
  outputFileTracingRoot: path.join(process.cwd(), "../../"),
  outputFileTracingExcludes: {
    '*': [
      '**/.next/cache/**',
      '**/apps/whatsapp-sidecar/**',
      '../../apps/whatsapp-sidecar/**',
      '**/ngrok*',
      '**/*@swc/core*',
      '**/*esbuild*',
      '**/*typescript*',
      '**/node_modules/firebase-tools*',
      '**/node_modules/@google-cloud/firestore/build/protos*'
    ],
  },
};

export default nextConfig;
