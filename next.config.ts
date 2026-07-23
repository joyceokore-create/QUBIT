import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for a lean production
  // container image. See Dockerfile + docker-compose.yml.
  output: "standalone",
  // The dev-tools indicator defaults to the bottom-left, where it overlaps the
  // Riverbank sidebar's account avatar and swallows its clicks in dev. Move it to
  // the bottom-right (clear area) so every control is clickable while developing.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
