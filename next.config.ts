import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for a lean production
  // container image. See Dockerfile + docker-compose.yml.
  output: "standalone",
  // Milestone D — playwright-core drives the PDF export (src/server/pdf/render.ts). It must
  // stay a runtime require (dynamic requires, browsers.json read via path.join, child
  // processes); it is already on Next's built-in external list, this pins the intent. The
  // runner image copies the full node_modules, which is what makes it resolvable there.
  serverExternalPackages: ["playwright-core"],
  // The dev-tools indicator defaults to the bottom-left, where it overlaps the
  // Riverbank sidebar's account avatar and swallows its clicks in dev. Move it to
  // the bottom-right (clear area) so every control is clickable while developing.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
