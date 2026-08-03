import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import {
  listAccessRequests,
  countNewAccessRequests,
  reviewAccessRequest,
  AccessRequestError,
} from "@/server/access-requests";

const EMAIL = "admin-svc@example.invalid";
let ctx: TenantContext;

describe("access-request admin service", () => {
  beforeAll(async () => {
    const demoB = await prisma.tenant.findUnique({ where: { slug: "demo-b" } });
    if (!demoB) throw new Error("Requires seeded data — run `pnpm prisma db seed` first.");
    ctx = { tenantId: demoB.id, userId: "test-ar-actor", roles: ["PlatformSuperAdmin"] };
    await prisma.accessRequest.deleteMany({ where: { email: EMAIL } });
  });

  afterAll(async () => {
    const rows = await prisma.accessRequest.findMany({ where: { email: EMAIL } });
    // Same RLS constraint as above: audit_log deletes must run inside withTenant() or they
    // silently delete nothing, leaking rows across test runs.
    await withTenant(ctx, (tx) =>
      tx.auditLog.deleteMany({ where: { entityId: { in: rows.map((r) => r.id) } } }),
    );
    await prisma.accessRequest.deleteMany({ where: { email: EMAIL } });
  });

  it("reviewing sets status + reviewer and writes an audit row", async () => {
    const row = await prisma.accessRequest.create({
      data: { fullName: "Ada K.", email: EMAIL, company: "Acme" },
    });
    const before = await countNewAccessRequests();

    const updated = await reviewAccessRequest(ctx, row.id, "REVIEWED");
    expect(updated.status).toBe("REVIEWED");
    expect(updated.reviewedById).toBe(ctx.userId);
    expect(updated.reviewedAt).toBeInstanceOf(Date);

    expect(await countNewAccessRequests()).toBe(before - 1);

    // audit_log carries RLS (FORCE ROW LEVEL SECURITY) — a bare prisma.auditLog.findMany()
    // runs with no app.tenant_id set and is denied all rows, so the read must go through
    // withTenant() same as the write (see tests/rls/audit.test.ts).
    const audits = await withTenant(ctx, (tx) =>
      tx.auditLog.findMany({
        where: { entityType: "access_request", entityId: row.id, action: "access_request_review" },
      }),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].tenantId).toBe(ctx.tenantId);
    expect(audits[0].actorId).toBe(ctx.userId);
  });

  it("throws AccessRequestError for an unknown id", async () => {
    await expect(reviewAccessRequest(ctx, "does-not-exist", "DISMISSED")).rejects.toBeInstanceOf(
      AccessRequestError,
    );
  });

  it("lists NEW requests before reviewed ones", async () => {
    await prisma.accessRequest.create({ data: { fullName: "New One", email: EMAIL, company: "Beta" } });
    const list = await listAccessRequests();
    const firstNewIdx = list.findIndex((r) => r.status === "NEW");
    const firstReviewedIdx = list.findIndex((r) => r.status !== "NEW");
    if (firstReviewedIdx !== -1) expect(firstNewIdx).toBeLessThan(firstReviewedIdx);
  });
});
