// UX11 — Super Admin › Admin home: counts, lists and the activity feed stay inside the
// viewer's tenant, and "Grant access" creates the account in the caller's tenant only, marks
// the request reviewed and writes audit rows. Requires a migrated, seeded DB. Synthetic data
// only (@fixture.invalid / @example.invalid); cleans up after itself.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getAdminHome } from "@/server/admin-home";
import { AccessRequestError, grantAccessRequest, reviewAccessRequest } from "@/server/access-requests";
import { updateUserRoles, UserAdminError } from "@/server/users";
import { createUsers, cleanupFixtureUsers } from "./_users";

const TZ = "Africa/Nairobi";
const TAG = `admhome_${Date.now()}`;
const GRANT_EMAIL = `${TAG}_grant@example.invalid`;
const OPTS = { tab: "waiting" as const, page: 1, size: 100, timeZone: TZ };

describe("UX11 Admin home", () => {
  const now = new Date();
  let rbId: string;
  let bId: string;
  let rb: TenantContext;
  let b: TenantContext;
  let rbTeam: string;
  let bTeam: string;
  let bNames: string[] = [];
  const requestIds: string[] = [];

  beforeAll(async () => {
    const [r, d] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!r || !d) throw new Error("Seed required.");
    rbId = r.id;
    bId = d.id;
    const [[ra], [ba, b1, b2]] = await Promise.all([createUsers(rbId, 1, "admhome"), createUsers(bId, 3, "admhomeb")]);
    rb = { tenantId: rbId, userId: ra.id, roles: ["PlatformSuperAdmin"] };
    b = { tenantId: bId, userId: ba.id, roles: ["PlatformSuperAdmin"] };
    bNames = [b1.name, b2.name];
    rbTeam = await withTenant(rb, async (tx) => (await tx.team.create({ data: { tenantId: rbId, name: `${TAG} rb team` }, select: { id: true } })).id);
    bTeam = await withTenant(b, async (tx) => (await tx.team.create({ data: { tenantId: bId, name: `${TAG} b team` }, select: { id: true } })).id);
    void b1;
    void b2;
  });

  afterAll(async () => {
    // The granted account (an @example.invalid user) first, then the fixtures and their rows.
    await withTenant(rb, async (tx) => {
      const users = await tx.user.findMany({ where: { email: GRANT_EMAIL }, select: { id: true } });
      const ids = users.map((u) => u.id);
      if (ids.length) {
        await tx.roleAssignment.deleteMany({ where: { userId: { in: ids } } });
        await tx.auditLog.deleteMany({ where: { entityId: { in: ids } } });
        await tx.user.deleteMany({ where: { id: { in: ids } } });
      }
      await tx.auditLog.deleteMany({ where: { entityId: { in: requestIds } } });
      await tx.team.deleteMany({ where: { id: rbTeam } });
    });
    await withTenant(b, async (tx) => {
      await tx.auditLog.deleteMany({ where: { entityId: { in: requestIds } } });
      await tx.team.deleteMany({ where: { id: bTeam } });
    });
    await prisma.accessRequest.deleteMany({ where: { email: { contains: TAG } } });
    await cleanupFixtureUsers(rbId);
    await cleanupFixtureUsers(bId);
    await prisma.$disconnect();
  });

  it("counts and lists never include the other tenant's users or audit rows", async () => {
    const rbBefore = await getAdminHome(rb, OPTS, now);
    const bBefore = await getAdminHome(b, OPTS, now);

    // Tenant B gets: a suspended user still in a team, a never-signed-in user whose invite
    // ran out, and a role grant this week.
    const [, b1, b2] = await withTenant(b, (tx) => tx.user.findMany({ where: { email: { contains: "admhomeb" } }, orderBy: { name: "asc" }, select: { id: true } }));
    await withTenant(b, async (tx) => {
      await tx.user.update({ where: { id: b1.id }, data: { status: "SUSPENDED" } });
      await tx.teamMember.create({ data: { tenantId: bId, teamId: bTeam, userId: b1.id } });
      await tx.inviteToken.create({
        data: { tenantId: bId, userId: b2.id, tokenHash: randomBytes(32).toString("hex"), purpose: "invite", expiresAt: new Date(now.getTime() - 86_400_000), createdById: b.userId },
      });
    });
    await updateUserRoles(b, b2.id, ["Member"]);

    const rbAfter = await getAdminHome(rb, OPTS, now);
    const bAfter = await getAdminHome(b, OPTS, now);

    expect(rbAfter.attention.suspendedInTeams).toBe(rbBefore.attention.suspendedInTeams);
    expect(rbAfter.attention.expiredInvites).toBe(rbBefore.attention.expiredInvites);
    expect(rbAfter.kpis.roleChanges.granted).toBe(rbBefore.kpis.roleChanges.granted);
    // UX fidelity F1: the KPI spark series is tenant-scoped too.
    expect(rbAfter.kpis.roleChanges.perDay).toEqual(rbBefore.kpis.roleChanges.perDay);
    expect(rbAfter.kpis.activeUsers.active).toBe(rbBefore.kpis.activeUsers.active);

    expect(bAfter.attention.suspendedInTeams).toBe(bBefore.attention.suspendedInTeams + 1);
    expect(bAfter.attention.expiredInvites).toBe(bBefore.attention.expiredInvites + 1);
    expect(bAfter.kpis.roleChanges.granted).toBe(bBefore.kpis.roleChanges.granted + 1);
    expect(bAfter.kpis.roleChanges.perDay.reduce((a, n) => a + n, 0)).toBeGreaterThan(bBefore.kpis.roleChanges.perDay.reduce((a, n) => a + n, 0));
    expect(bAfter.kpis.roleChanges.perDay).toHaveLength(7);
    expect(bAfter.kpis.activeUsers.active).toBe(bBefore.kpis.activeUsers.active - 1); // b1 suspended

    // The feed: B's grant shows for B, never for Riverbank.
    const line = `Granted Member to ${bNames[1]}`;
    expect(bAfter.activity?.map((a) => a.line)).toContain(line);
    expect(rbAfter.activity?.some((a) => bNames.some((n) => a.line.includes(n)))).toBe(false);

    // Grant options are this tenant's departments and teams only.
    expect(rbAfter.grant?.teams.map((t) => t.id)).toContain(rbTeam);
    expect(rbAfter.grant?.teams.map((t) => t.id)).not.toContain(bTeam);
    expect(bAfter.grant?.teams.map((t) => t.id)).toContain(bTeam);
    expect(bAfter.grant?.teams.map((t) => t.id)).not.toContain(rbTeam);
  });

  it("lists waiting requests oldest first, with per-status counts", async () => {
    const older = await prisma.accessRequest.create({ data: { fullName: `user_${TAG}_old`, email: `${TAG}_old@example.invalid`, company: "Synthetic Co", createdAt: new Date(now.getTime() - 3 * 86_400_000) } });
    const newer = await prisma.accessRequest.create({ data: { fullName: `user_${TAG}_new`, email: `${TAG}_new@example.invalid`, company: "Synthetic Co" } });
    requestIds.push(older.id, newer.id);
    const home = await getAdminHome(rb, OPTS, now);
    const ids = home.requests!.rows.map((r) => r.id);
    expect(ids.indexOf(older.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(older.id)).toBeLessThan(ids.indexOf(newer.id));
    expect(home.requests!.counts.NEW).toBeGreaterThanOrEqual(2);
    expect(home.kpis.waiting!.count).toBe(home.requests!.counts.NEW);

    // Dismiss one (a fixed reason CODE kept on the audit row, in the reviewer's tenant — D-F3b:
    // the audit row carries no name, email or free text).
    await reviewAccessRequest(rb, newer.id, "DISMISSED", { reasonCode: "duplicate" });
    const audit = await withTenant(rb, (tx) => tx.auditLog.findFirst({ where: { entityId: newer.id, action: "access_request_review" } }));
    expect(audit?.after).toEqual({ status: "DISMISSED", reasonCode: "duplicate" });
    expect(JSON.stringify([audit?.before, audit?.after])).not.toContain(TAG);
    expect(await withTenant(b, (tx) => tx.auditLog.count({ where: { entityId: newer.id } }))).toBe(0);
    const dismissed = await getAdminHome(rb, { ...OPTS, tab: "dismissed" }, now);
    expect(dismissed.requests!.rows.map((r) => r.id)).toContain(newer.id);
    expect(dismissed.requests!.rows.find((r) => r.id === newer.id)?.reviewedBy).toBe("Fixture ADMHOME1");
  });

  it("refuses another tenant's team and leaves the request waiting", async () => {
    const req = await prisma.accessRequest.create({ data: { fullName: `user_${TAG}_grant`, email: GRANT_EMAIL, company: "Synthetic Co", jobTitle: "Analyst" } });
    requestIds.push(req.id);
    await expect(grantAccessRequest(rb, req.id, { role: "Member", teamId: bTeam })).rejects.toBeInstanceOf(UserAdminError);
    expect((await prisma.accessRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("NEW");
    expect(await withTenant(rb, (tx) => tx.user.count({ where: { email: GRANT_EMAIL } }))).toBe(0);
  });

  it("grant access creates the user in the caller's tenant only, marks the request reviewed and audits it", async () => {
    const req = await prisma.accessRequest.findFirstOrThrow({ where: { email: GRANT_EMAIL } });
    const { created, request } = await grantAccessRequest(rb, req.id, { role: "Member", teamId: rbTeam });

    expect(request.status).toBe("REVIEWED");
    expect(request.reviewedById).toBe(rb.userId);

    const [user, inTeam] = await withTenant(rb, (tx) =>
      Promise.all([
        tx.user.findUnique({ where: { id: created.user.id }, select: { tenantId: true, email: true, name: true, status: true, roles: { select: { role: true } } } }),
        tx.teamMember.count({ where: { teamId: rbTeam, userId: created.user.id } }),
      ]),
    );
    expect(user).toMatchObject({ tenantId: rbId, email: GRANT_EMAIL, name: `user_${TAG}_grant`, status: "INVITED" });
    expect(user?.roles.map((r) => r.role)).toEqual(["Member"]);
    expect(inTeam).toBe(1);
    // Not visible (or present) in the other tenant.
    expect(await withTenant(b, (tx) => tx.user.count({ where: { email: GRANT_EMAIL } }))).toBe(0);

    const audits = await withTenant(rb, (tx) =>
      tx.auditLog.findMany({ where: { OR: [{ entityId: created.user.id }, { entityId: req.id }] }, select: { action: true, tenantId: true, actorId: true, after: true } }),
    );
    const actions = audits.map((a) => a.action).sort();
    expect(actions).toEqual(expect.arrayContaining(["access_request_review", "create", "role_grant"]));
    expect(audits.every((a) => a.tenantId === rbId && a.actorId === rb.userId)).toBe(true);
    expect(audits.find((a) => a.action === "access_request_review")?.after).toMatchObject({ status: "REVIEWED", userId: created.user.id });
    expect(await withTenant(b, (tx) => tx.auditLog.count({ where: { OR: [{ entityId: created.user.id }, { entityId: req.id }] } }))).toBe(0);

    // The home's feed says it in words; the other tenant's feed doesn't.
    const home = await getAdminHome(rb, OPTS, now);
    expect(home.activity?.map((a) => a.line)).toContain(`Approved the access request from user_${TAG}_grant`);
    expect(home.activity?.find((a) => a.line.startsWith("Approved the access request"))?.actorName).toBe("Fixture ADMHOME1");
    const bHome = await getAdminHome(b, OPTS, now);
    expect(bHome.activity?.some((a) => a.line.includes(TAG))).toBe(false);
  });

  it("a second grant is refused, and a clash on email leaves the request waiting", async () => {
    const req = await prisma.accessRequest.findFirstOrThrow({ where: { email: GRANT_EMAIL } });
    await expect(grantAccessRequest(rb, req.id, { role: "Member" })).rejects.toMatchObject({ code: "ALREADY_REVIEWED" });
    await expect(grantAccessRequest(rb, req.id, { role: "Member" })).rejects.toBeInstanceOf(AccessRequestError);

    const dup = await prisma.accessRequest.create({ data: { fullName: `user_${TAG}_dup`, email: GRANT_EMAIL, company: "Synthetic Co" } });
    requestIds.push(dup.id);
    await expect(grantAccessRequest(rb, dup.id, { role: "Member" })).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
    expect((await prisma.accessRequest.findUniqueOrThrow({ where: { id: dup.id } })).status).toBe("NEW");
  });
});
