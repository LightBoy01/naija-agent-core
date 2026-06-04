import type { NextConfig } from "next";

import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["bcrypt"],
  outputFileTracingRoot: path.join(process.cwd(), "../../"),
  outputFileTracingExcludes: {
    '*': [
      '**/*@swc/core*',
      '**/*esbuild*',
      '**/*typescript*',
      '**/node_modules/firebase-tools*',
      '**/node_modules/@google-cloud/firestore/build/protos*',
      '**/apps/whatsapp-sidecar/**',
      '**/ngrok*'
    ],
  },
};

export default nextConfig;
