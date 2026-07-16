import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for a lean production
  // container image. See Dockerfile + docker-compose.yml.
  output: "standalone",
};

export default nextConfig;
