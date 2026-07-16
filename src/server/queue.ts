import "server-only";
import { PgBoss, type SendOptions } from "pg-boss";

/**
 * Background job queue via pg-boss (docs/clickup-transformation/02-architecture.md).
 * Bootstrap only — workers (recurring tasks, notifications, search indexing, sprint
 * snapshots, automations) register in their own phases. pg-boss stores jobs in
 * Postgres, so it shares the app database and needs no extra infra.
 */

const globalForBoss = globalThis as unknown as {
  __qubitBoss?: PgBoss;
  __qubitBossStart?: Promise<PgBoss>;
};

/**
 * Lazily start (once) and return the shared pg-boss instance. Idempotent: concurrent
 * callers await the same start promise. pg-boss creates its own schema on first start.
 */
export function getQueue(): Promise<PgBoss> {
  if (globalForBoss.__qubitBoss) return Promise.resolve(globalForBoss.__qubitBoss);
  if (globalForBoss.__qubitBossStart) return globalForBoss.__qubitBossStart;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return Promise.reject(new Error("DATABASE_URL is required to start the job queue."));
  }

  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (err: unknown) => {
    // Queue errors must never crash the request path; surface for ops instead.
    console.error("[pg-boss]", err);
  });

  const starting = boss.start().then((started) => {
    globalForBoss.__qubitBoss = started;
    return started;
  });
  globalForBoss.__qubitBossStart = starting;
  return starting;
}

/** Enqueue a job by name. Thin wrapper so callers don't touch the boss instance directly. */
export async function enqueue<T extends object>(
  queueName: string,
  data: T,
  options?: SendOptions,
): Promise<string | null> {
  const boss = await getQueue();
  return boss.send(queueName, data, options ?? {});
}
