// UX fidelity Tier 2 (plan R7) — POST /api/auth/mfa/reset, the Users › Edit drawer's "Reset
// MFA": refuses a self-reset, needs the actor's own current code when they use MFA, clears
// the target's factors in the caller's tenant only, audits, and notifies the person.
// Requires a migrated, seeded DB. Synthetic fixture users only; cleans up after itself.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { generate, generateSecret } from "otplib";

vi.mock("@/lib/api-guard", () => ({ requirePermission: vi.fn() }));

import { requirePermission } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { encryptMfaSecret } from "@/lib/mfa";
import { POST } from "@/app/api/auth/mfa/reset/route";
import { cleanupFixtureUsers, createUsers } from "./_users";

describe("Reset MFA route", () => {
  let ctx: TenantContext;
  let targetId: string;
  let otherTenantUserId: string;
  let bTenantId: string;
  const actorSecret = generateSecret();
  const post = (body: unknown) => POST(new Request("http://localhost/api/auth/mfa/reset", { method: "POST", body: JSON.stringify(body) }));

  beforeAll(async () => {
    const [r, d] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!r || !d) throw new Error("Seed required.");
    bTenantId = d.id;
    const [[actor, target], [other]] = await Promise.all([createUsers(r.id, 2, "mfareset"), createUsers(d.id, 1, "mfaresetb")]);
    ctx = { tenantId: r.id, userId: actor.id, roles: ["PlatformSuperAdmin"] };
    targetId = target.id;
    otherTenantUserId = other.id;
    await withTenant(ctx, async (tx) => {
      await tx.user.update({ where: { id: actor.id }, data: { mfaSecret: encryptMfaSecret(actorSecret) } });
      await tx.user.update({ where: { id: target.id }, data: { mfaSecret: encryptMfaSecret(generateSecret()) } });
    });
    await withTenant({ tenantId: d.id, userId: other.id }, (tx) => tx.user.update({ where: { id: other.id }, data: { mfaSecret: encryptMfaSecret(generateSecret()) } }));
  });

  beforeEach(() => (requirePermission as unknown as Mock).mockResolvedValue({ ctx }));

  afterAll(async () => {
    await withTenant(ctx, async (tx) => {
      await tx.notification.deleteMany({ where: { userId: targetId } });
      await tx.domainEvent.deleteMany({ where: { type: "user.mfa_reset", actorId: ctx.userId } });
      await tx.auditLog.deleteMany({ where: { entityId: targetId } });
    });
    await cleanupFixtureUsers(ctx.tenantId);
    await cleanupFixtureUsers(bTenantId);
    await prisma.$disconnect();
  });

  it("refuses a self-reset", async () => {
    const res = await post({ userId: ctx.userId, code: await generate({ secret: actorSecret }) });
    expect(res.status).toBe(409);
  });

  it("asks for the actor's own current code (step-up)", async () => {
    expect((await post({ userId: targetId })).status).toBe(403);
    expect((await post({ userId: targetId, code: "000000" })).status).toBe(403);
    const still = await withTenant(ctx, (tx) => tx.user.findUniqueOrThrow({ where: { id: targetId }, select: { mfaSecret: true } }));
    expect(still.mfaSecret).not.toBeNull();
  });

  it("never reaches another tenant's user", async () => {
    const res = await post({ userId: otherTenantUserId, code: await generate({ secret: actorSecret }) });
    expect(res.status).toBe(404);
  });

  it("with a valid code: clears the factors, audits and notifies the person", async () => {
    const res = await post({ userId: targetId, code: await generate({ secret: actorSecret }) });
    expect(res.status).toBe(200);
    const [row, audits, notes] = await withTenant(ctx, (tx) =>
      Promise.all([
        tx.user.findUniqueOrThrow({ where: { id: targetId }, select: { mfaSecret: true, mfaRecoveryCodes: true } }),
        tx.auditLog.findMany({ where: { entityId: targetId, actorId: ctx.userId } }),
        tx.notification.findMany({ where: { userId: targetId, kind: "mfa_reset" } }),
      ]),
    );
    expect(row.mfaSecret).toBeNull();
    expect(row.mfaRecoveryCodes).toEqual([]);
    expect(audits.some((a) => (a.after as { mfa_reset?: boolean } | null)?.mfa_reset === true)).toBe(true);
    expect(notes).toHaveLength(1);
  });
});
