// M0 jobs runtime (docs/16-revamp-plan.md §10; DM1.15 №4 transport, DM1.18 tenant loop):
// JobRun observability, mandatory idempotency, per-tenant execution under RLS, and the
// CRON_SECRET-guarded dispatch route.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant } from "@/lib/tenant";
import { runJob, listJobs } from "@/server/jobs";
import { POST as cronPost } from "@/app/api/internal/cron/route";

const KEY_PREFIX = `jobs-test-${process.pid}`;
let keySeq = 0;
const nextKey = () => `${KEY_PREFIX}:${++keySeq}`;

function cron(body: unknown, secret?: string) {
  return cronPost(
    new Request("http://localhost/api/internal/cron", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("jobs runtime", () => {
  const envBefore = process.env.CRON_SECRET;

  beforeAll(() => {
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterAll(async () => {
    process.env.CRON_SECRET = envBefore;
    await prisma.jobRun.deleteMany({ where: { idempotencyKey: { startsWith: KEY_PREFIX } } });
    await prisma.$disconnect();
  });

  it("registers the heartbeat job", () => {
    expect(listJobs()).toContain("heartbeat");
  });

  it("runs across every tenant under RLS and records per-tenant detail", async () => {
    const result = await runJob("heartbeat", nextKey());
    expect(result.status).toBe("Succeeded");

    const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
    for (const t of tenants) {
      // The job counted THIS tenant's projects — the RLS-scoped truth.
      const scoped = await withTenant({ tenantId: t.id, userId: "test" }, (tx) => tx.project.count());
      expect((result.detail[t.slug] as { projects: number }).projects).toBe(scoped);
    }

    const run = await prisma.jobRun.findUniqueOrThrow({ where: { id: result.runId } });
    expect(run.status).toBe("Succeeded");
    expect(run.finishedAt).not.toBeNull();
  });

  it("dedupes on the idempotency key: a re-delivered run is a recorded no-op", async () => {
    const key = nextKey();
    const first = await runJob("heartbeat", key);
    const second = await runJob("heartbeat", key);
    expect(first.status).toBe("Succeeded");
    expect(second.status).toBe("Skipped");
    expect(second.runId).toBe(first.runId);
    const runs = await prisma.jobRun.findMany({ where: { idempotencyKey: key } });
    expect(runs).toHaveLength(1);
  });

  it("rejects an unknown job", async () => {
    await expect(runJob("no-such-job", nextKey())).rejects.toThrow('Unknown job "no-such-job"');
  });

  describe("POST /api/internal/cron", () => {
    afterEach(() => {
      process.env.CRON_SECRET = "test-cron-secret";
    });

    it("503s when CRON_SECRET is unconfigured", async () => {
      delete process.env.CRON_SECRET;
      const res = await cron({ job: "heartbeat" });
      expect(res.status).toBe(503);
    });

    it("401s on a missing or wrong secret", async () => {
      expect((await cron({ job: "heartbeat" })).status).toBe(401);
      expect((await cron({ job: "heartbeat" }, "wrong-secret")).status).toBe(401);
    });

    it("404s on an unknown job without running anything", async () => {
      const res = await cron({ job: "nope", key: nextKey() }, "test-cron-secret");
      expect(res.status).toBe(404);
    });

    it("422s on a malformed body", async () => {
      const res = await cron({ nope: true }, "test-cron-secret");
      expect(res.status).toBe(422);
    });

    it("dispatches a job with the shared secret", async () => {
      const key = nextKey();
      const res = await cron({ job: "heartbeat", key }, "test-cron-secret");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; job: string };
      expect(body.job).toBe("heartbeat");
      expect(body.status).toBe("Succeeded");
    });
  });
});
