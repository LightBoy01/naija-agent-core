import type { NextConfig } from "next";

import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@naija-agent/firebase", "@naija-agent/types", "@naija-agent/database", "@naija-agent/storage"],
  serverExternalPackages: ["firebase-admin", "postgres", "bcrypt", "bullmq", "ioredis", "@google/genai"],
  outputFileTracingRoot: path.join(process.cwd(), "../../"),
};

export default nextConfig;
