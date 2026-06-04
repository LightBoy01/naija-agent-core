import type { NextConfig } from "next";

import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["firebase-admin", "postgres", "bcrypt", "bullmq", "ioredis", "@google/genai", "openai", "ali-oss"],
  outputFileTracingRoot: path.join(process.cwd(), "../../"),
  outputFileTracingExcludes: {
    '*': [
      '**/*@swc/core*',
      '**/*esbuild*',
      '**/*typescript*',
      '**/node_modules/firebase-tools*',
      '**/node_modules/@google-cloud*'
    ],
  },
};

export default nextConfig;
