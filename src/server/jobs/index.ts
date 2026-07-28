import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withTenant } from "@/lib/tenant";
import type { JobDefinition, JobRunResult } from "@/server/jobs/types";

/**
 * Jobs runtime (docs/16-revamp-plan.md §10; transport per DM1.15 №4). The host crontab
 * hits POST /api/internal/cron, which dispatches here. Every run writes a JobRun row;
 * idempotency keys are mandatory so a re-delivered cron hit is a recorded no-op, never a
 * double execution. Tenant data access happens ONLY inside withTenant per tenant — DM1.18.
 */

// M0 ships the runtime with one read-only job proving the tenant loop under RLS.
// Real jobs (nightly snapshots M1, Friday check-ins M2, nudger M3, digests M5) register here.
const heartbeat: JobDefinition = {
  name: "heartbeat",
  async run(tx) {
    const projects = await tx.project.count();
    return { projects };
  },
};

const REGISTRY = new Map<string, JobDefinition>([[heartbeat.name, heartbeat]]);

export function getJob(name: string): JobDefinition | undefined {
  return REGISTRY.get(name);
}

export function listJobs(): string[] {
  return [...REGISTRY.keys()];
}

/**
 * Run a named job across all tenants. Returns Skipped (with the prior run's id) when the
 * idempotency key was already claimed. A tenant failure is recorded per-slug and marks
 * the run Failed, but never stops the loop — one bad tenant must not starve the others.
 */
export async function runJob(name: string, idempotencyKey: string): Promise<JobRunResult> {
  const job = getJob(name);
  if (!job) throw new Error(`Unknown job "${name}".`);

  // Claim the key; a unique-constraint hit means this run already happened (or is running).
  let run;
  try {
    run = await prisma.jobRun.create({ data: { job: name, idempotencyKey } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.jobRun.findUnique({ where: { idempotencyKey } });
      return { runId: existing?.id ?? "", job: name, status: "Skipped", detail: { reason: "duplicate idempotency key" } };
    }
    throw err;
  }

  const detail: Record<string, unknown> = {};
  let failed = false;
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true }, orderBy: { slug: "asc" } });
  for (const tenant of tenants) {
    try {
      // Machine actor: the sentinel user id never matches a row and is never used by RLS
      // (policies key on app.tenant_id only); it just keeps audit/actor trails honest.
      const result = await withTenant({ tenantId: tenant.id, userId: `job:${name}` }, (tx) =>
        job.run(tx, tenant),
      );
      detail[tenant.slug] = result ?? { ok: true };
    } catch (err) {
      failed = true;
      detail[tenant.slug] = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  const status = failed ? "Failed" : "Succeeded";
  await prisma.jobRun.update({
    where: { id: run.id },
    data: {
      status,
      finishedAt: new Date(),
      detail: detail as Prisma.InputJsonValue,
      error: failed ? Object.entries(detail).filter(([, v]) => (v as { error?: string }).error).map(([slug, v]) => `${slug}: ${(v as { error: string }).error}`).join("; ") : null,
    },
  });
  return { runId: run.id, job: name, status, detail };
}
