import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Q's LLM provider must never be reached from the test suite (it would make real network
  // calls to the internal AI box and be non-deterministic/slow). Strip the credentials here
  // — before any worker spawns — so every suite takes the deterministic/mock offline path.
  // A test that wants the model should mock `fetch`/`llmChat` and set these itself.
  delete env.Q_AI_API_KEY;
  delete env.Q_AI_BASE_URL;
  delete env.ANTHROPIC_API_KEY;
  Object.assign(process.env, env);
  delete process.env.Q_AI_API_KEY;
  delete process.env.Q_AI_BASE_URL;
  delete process.env.ANTHROPIC_API_KEY;

  return {
    plugins: [react()],
    test: {
      environment: "jsdom",
      environmentMatchGlobs: [["tests/rls/**", "node"]],
      setupFiles: ["./tests/unit/setup.ts"],
      // Q's LLM provider must never be reached from tests (real network calls to the internal
      // AI box → non-deterministic + slow). Blank the credentials in every worker so all
      // suites take the deterministic/mock offline path. `test.env` is the reliable channel —
      // process.env mutations in this config file don't propagate to workers. A test that
      // wants the model sets these itself and mocks `fetch` (see tests/unit/q-llm.test.ts).
      env: { Q_AI_API_KEY: "", Q_AI_BASE_URL: "", ANTHROPIC_API_KEY: "" },
      globals: true,
      include: ["tests/unit/**/*.test.{ts,tsx}", "tests/rls/**/*.test.ts"],
      // The RLS/integration tests all hit one shared Postgres DB; running files in
      // parallel lets tenant-wide queries and fixtures from different files interfere.
      // Serialise files for deterministic DB state.
      fileParallelism: false,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        // `server-only` has no resolvable entry outside the Next bundler; stub it.
        "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
      },
    },
  };
});
