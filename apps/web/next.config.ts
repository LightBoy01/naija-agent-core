import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@naija-agent/firebase", "@naija-agent/types"],
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
