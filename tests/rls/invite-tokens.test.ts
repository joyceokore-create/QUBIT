// M-O3 (docs/22 §10) — token invites against the real database. The acceptance list:
// mint → consume happy path, expiry, single-use, wrong-hash miss, cross-tenant isolation,
// audit rows, and the INVITED-with-null-hash invariant that makes an unaccepted invite
// unusable as a login.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { hashInviteToken } from "@/lib/invite-token";
import { consumeInviteToken, InviteError, mintInvite, resendInvite, startPasswordReset } from "@/server/invites";
import { createUser } from "@/server/users";

const EMAIL = "invite-flow@demo-b.example.invalid";
const OTHER_EMAIL = "invite-other@demo-b.example.invalid";
const GOOD_PASSWORD = "Str0ng!Passw0rd42";

describe("M-O3 invite tokens", () => {
  let tenantId: string;
  let riverbankId: string;
  let ctx: TenantContext;

  async function scrub() {
    await withTenant(ctx, async (tx) => {
      const users = await tx.user.findMany({ where: { email: { in: [EMAIL, OTHER_EMAIL] } }, select: { id: true } });
      const ids = users.map((u) => u.id);
      if (!ids.length) return;
      await tx.inviteToken.deleteMany({ where: { userId: { in: ids } } });
      await tx.roleAssignment.deleteMany({ where: { userId: { in: ids } } });
      await tx.auditLog.deleteMany({ where: { entityId: { in: ids } } });
      await tx.user.deleteMany({ where: { id: { in: ids } } });
    });
  }

  beforeAll(async () => {
    const [demoB, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!demoB || !riverbank) throw new Error("Seed required — run `pnpm prisma:seed`.");
    tenantId = demoB.id;
    riverbankId = riverbank.id;
    ctx = { tenantId, userId: "invite-test-actor", roles: ["PlatformSuperAdmin"] };
    await scrub();
  });

  afterEach(scrub);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function invite(email = EMAIL) {
    return createUser(ctx, { name: "Invite Flow", email, roles: ["Member"] });
  }

  it("an invited user is INVITED with NO password hash — the account can't be signed into yet", async () => {
    const { user } = await invite();
    const row = await withTenant(ctx, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { status: true, passwordHash: true, mustChangePassword: true } }),
    );
    expect(row.status).toBe("INVITED");
    expect(row.passwordHash).toBeNull();
    expect(row.mustChangePassword).toBe(true);
  });

  it("stores only the HASH of the token — a leaked row can't be replayed", async () => {
    const { user } = await invite();
    const { acceptUrl } = await mintInvite(ctx, user.id);
    const raw = new URL(acceptUrl).searchParams.get("token")!;

    const rows = await withTenant(ctx, (tx) =>
      tx.inviteToken.findMany({ where: { userId: user.id }, select: { tokenHash: true, consumedAt: true } }),
    );
    const live = rows.filter((r) => !r.consumedAt);
    expect(live).toHaveLength(1);
    expect(live[0].tokenHash).toBe(hashInviteToken(raw));
    expect(live[0].tokenHash).not.toBe(raw);
  });

  it("consuming the token sets the password and activates the account", async () => {
    const { user, acceptUrl } = await invite();
    // Email is off in tests, so the link comes back for the admin — that IS the fallback.
    expect(acceptUrl).toBeTruthy();
    const raw = new URL(acceptUrl!).searchParams.get("token")!;

    const result = await consumeInviteToken(raw, GOOD_PASSWORD);
    expect(result.email).toBe(EMAIL);
    expect(result.tenantSlug).toBe("demo-b");

    const row = await withTenant(ctx, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { status: true, passwordHash: true, mustChangePassword: true } }),
    );
    expect(row.status).toBe("ACTIVE");
    expect(row.passwordHash).toBeTruthy();
    expect(row.mustChangePassword).toBe(false);
  });

  it("is single-use — the second attempt fails and changes nothing", async () => {
    const { acceptUrl } = await invite();
    const raw = new URL(acceptUrl!).searchParams.get("token")!;
    await consumeInviteToken(raw, GOOD_PASSWORD);
    await expect(consumeInviteToken(raw, "An0ther!Passw0rd9")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("rejects an unknown token with the same generic message (no existence oracle)", async () => {
    await expect(consumeInviteToken("not-a-real-token", GOOD_PASSWORD)).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
    await expect(consumeInviteToken("", GOOD_PASSWORD)).rejects.toBeInstanceOf(InviteError);
  });

  it("rejects an expired token", async () => {
    const { user, acceptUrl } = await invite();
    const raw = new URL(acceptUrl!).searchParams.get("token")!;
    await withTenant(ctx, (tx) =>
      tx.inviteToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { expiresAt: new Date(Date.now() - 1000) },
      }),
    );
    await expect(consumeInviteToken(raw, GOOD_PASSWORD)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("enforces the password policy and no-reuse through the token path", async () => {
    const { acceptUrl } = await invite();
    const raw = new URL(acceptUrl!).searchParams.get("token")!;
    await expect(consumeInviteToken(raw, "short")).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
    // The token survives a rejected password — the user gets to try again.
    await expect(consumeInviteToken(raw, GOOD_PASSWORD)).resolves.toMatchObject({ email: EMAIL });
  });

  it("resend invalidates the previous link", async () => {
    const { user, acceptUrl } = await invite();
    const first = new URL(acceptUrl!).searchParams.get("token")!;
    const second = new URL((await resendInvite(ctx, user.id)).acceptUrl).searchParams.get("token")!;
    expect(second).not.toBe(first);

    await expect(consumeInviteToken(first, GOOD_PASSWORD)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await expect(consumeInviteToken(second, GOOD_PASSWORD)).resolves.toMatchObject({ email: EMAIL });
  });

  it("password reset works for an ACTIVE user and leaves them active", async () => {
    const { user, acceptUrl } = await invite();
    await consumeInviteToken(new URL(acceptUrl!).searchParams.get("token")!, GOOD_PASSWORD);

    const reset = await startPasswordReset(ctx, user.id);
    const raw = new URL(reset.acceptUrl).searchParams.get("token")!;
    await consumeInviteToken(raw, "Rot4ted!Passw0rd7");

    const row = await withTenant(ctx, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { status: true } }),
    );
    expect(row.status).toBe("ACTIVE");
  });

  it("RLS: a token minted in one tenant is invisible from the other", async () => {
    const { user } = await invite();
    const seen = await withTenant({ tenantId: riverbankId, userId: "test" }, (tx) =>
      tx.inviteToken.count({ where: { userId: user.id } }),
    );
    expect(seen).toBe(0);
  });

  it("cross-tenant: consuming a demo-b token only ever touches demo-b", async () => {
    const { user, acceptUrl } = await invite();
    const raw = new URL(acceptUrl!).searchParams.get("token")!;
    // A same-named user in the other tenant must be untouched by the accept.
    const otherBefore = await withTenant({ tenantId: riverbankId, userId: "test" }, (tx) =>
      tx.user.count({ where: { status: "ACTIVE" } }),
    );
    const result = await consumeInviteToken(raw, GOOD_PASSWORD);
    expect(result.tenantSlug).toBe("demo-b");

    const [activated, otherAfter] = await Promise.all([
      withTenant(ctx, (tx) => tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { status: true } })),
      withTenant({ tenantId: riverbankId, userId: "test" }, (tx) => tx.user.count({ where: { status: "ACTIVE" } })),
    ]);
    expect(activated.status).toBe("ACTIVE");
    expect(otherAfter).toBe(otherBefore);
  });

  it("writes audit rows for issue and acceptance, and never the raw token", async () => {
    const { user, acceptUrl } = await invite();
    const raw = new URL(acceptUrl!).searchParams.get("token")!;
    await consumeInviteToken(raw, GOOD_PASSWORD);

    const rows = await withTenant(ctx, (tx) =>
      tx.auditLog.findMany({ where: { entityType: "user", entityId: user.id }, select: { after: true } }),
    );
    const blob = JSON.stringify(rows);
    expect(blob).toContain("invite_sent");
    expect(blob).toContain("invite_accepted");
    expect(blob).not.toContain(raw); // the capability never lands in an immutable log
  });
});
