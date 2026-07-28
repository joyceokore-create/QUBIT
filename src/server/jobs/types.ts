import type { Prisma } from "@prisma/client";

/**
 * A named background job (docs/16-revamp-plan.md §10). The dispatcher loops every
 * tenant and calls `run` inside a transaction with `app.tenant_id` set — the DM1.18
 * rule — so a job body can never read or write across tenants. Jobs that mutate
 * tracked entities must write audit_log rows themselves (machine actor invariant).
 */
export interface JobDefinition {
  name: string;
  /** Runs once per tenant under RLS. The return value is recorded in JobRun.detail. */
  run(tx: Prisma.TransactionClient, tenant: { id: string; slug: string }): Promise<Record<string, unknown> | void>;
}

export interface JobRunResult {
  runId: string;
  job: string;
  status: "Succeeded" | "Failed" | "Skipped";
  /** Per-tenant outcome keyed by tenant slug. */
  detail: Record<string, unknown>;
}
