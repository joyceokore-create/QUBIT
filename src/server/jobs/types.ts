import type { Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";

export interface JobTenant {
  id: string;
  slug: string;
}
export type JobDetail = Record<string, unknown> | void;
/** A job's actor is the machine sentinel — it holds no roles and never needs them. */
export type JobContext = Pick<TenantContext, "tenantId" | "userId">;

/**
 * A named background job (docs/16-revamp-plan.md §10). The dispatcher loops every
 * tenant and calls `run` inside a transaction with `app.tenant_id` set — the DM1.18
 * rule — so a job body can never read or write across tenants. Jobs that mutate
 * tracked entities must write audit_log rows themselves (machine actor invariant).
 */
export interface JobDefinition {
  name: string;
  ownsTransaction?: false;
  /** Runs once per tenant under RLS. The return value is recorded in JobRun.detail. */
  run(tx: Prisma.TransactionClient, tenant: JobTenant): Promise<JobDetail>;
}

/**
 * A job that calls a THIRD PARTY (M7-C YouTrack sync). The dispatcher must not hold a
 * Postgres transaction open across a network round trip — one slow provider would pin a
 * connection for the length of the sync — so these receive a TenantContext instead of a
 * `tx` and open their own short transactions via withTenant. The DM1.18 rule is unchanged:
 * every read and write still happens inside withTenant.
 */
export interface NetworkJobDefinition {
  name: string;
  ownsTransaction: true;
  run(ctx: JobContext, tenant: JobTenant): Promise<JobDetail>;
}

export type AnyJobDefinition = JobDefinition | NetworkJobDefinition;

export interface JobRunResult {
  runId: string;
  job: string;
  status: "Succeeded" | "Failed" | "Skipped";
  /** Per-tenant outcome keyed by tenant slug. */
  detail: Record<string, unknown>;
}
