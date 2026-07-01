import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [react()],
    test: {
      environment: "jsdom",
      environmentMatchGlobs: [["tests/rls/**", "node"]],
      setupFiles: ["./tests/unit/setup.ts"],
      globals: true,
      include: ["tests/unit/**/*.test.{ts,tsx}", "tests/rls/**/*.test.ts"],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
