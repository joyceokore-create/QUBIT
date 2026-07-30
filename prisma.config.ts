import { defineConfig } from "prisma/config";

// Prisma CLI config — replaces the deprecated `package.json#prisma` block (removed in
// Prisma 7). Read by `pnpm prisma db seed`, `prisma migrate dev`, and the container
// entrypoint's `prisma migrate deploy`.
//
// A config file makes Prisma skip its own .env loading, so we load it ourselves with
// Node's built-in loader (no new dependency). In production DATABASE_URL comes from the
// container environment (docker compose env_file), where no .env file exists — hence the
// try/catch: a missing file is the normal case there, never an error.
try {
  process.loadEnvFile();
} catch {
  /* no .env on disk — env vars come from the process environment (container/CI) */
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
