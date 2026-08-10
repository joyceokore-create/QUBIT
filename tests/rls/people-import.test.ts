// DM1.72 — the org-setup wizard is retired; bulk people import survived it and lives in
// Admin → Users. What matters: one bad row never costs the good ones, every invited
// person gets a usable invite and NO password, and inviting is permission-gated.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { parsePeopleCsv } from "@/lib/people-csv";
import { importPeople } from "@/server/people-import";
import { createUsers, cleanupFixtureUsers } from "./_users";

const CSV = `name,email,role,group
Import One,import.one@fixture.invalid,ProjectManager,pm
Import Two,import.two@fixture.invalid,Member,qa
Broken Row,not-an-email,Member,developer
Import Three,import.three@fixture.invalid,NotARole,pm`;

describe("DM1.72 bulk people import", () => {
  let rbId: string;
  let adminCtx: TenantContext;
  let memberCtx: TenantContext;

  beforeAll(async () => {
    const rb = await prisma.tenant.findUnique({ where: { slug: "riverbank" } });
    if (!rb) throw new Error("Seed required.");
    rbId = rb.id;
    const [admin, member] = await createUsers(rbId, 2, "imp");
    adminCtx = { tenantId: rbId, userId: admin.id, roles: ["PlatformSuperAdmin"] };
    memberCtx = { tenantId: rbId, userId: member.id, roles: ["Member"] };
  });

  afterAll(async () => {
    await withTenant(adminCtx, async (tx) => {
      const imported = await tx.user.findMany({ where: { email: { endsWith: "@fixture.invalid" } }, select: { id: true } });
      const ids = imported.map((u) => u.id);
      await tx.inviteToken.deleteMany({ where: { userId: { in: ids } } });
      await tx.roleAssignment.deleteMany({ where: { userId: { in: ids } } });
      await tx.auditLog.deleteMany({ where: { entityId: { in: ids } } });
      await tx.user.deleteMany({ where: { id: { in: ids } } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("parses before touching the database — bad rows are reported with their line", () => {
    const { rows, errors } = parsePeopleCsv(CSV);
    expect(rows.map((r) => r.email)).toEqual(["import.one@fixture.invalid", "import.two@fixture.invalid"]);
    expect(errors).toHaveLength(2);
    expect(errors[0].line).toBe(4); // the malformed address
    expect(errors[1].message).toContain("Unknown role");
  });

  it("invites the good rows, with an invite link and NO password", async () => {
    const { rows } = parsePeopleCsv(CSV);
    const results = await importPeople(adminCtx, rows);
    expect(results.filter((r) => r.status === "invited")).toHaveLength(2);

    const created = await withTenant(adminCtx, (tx) =>
      tx.user.findMany({
        where: { email: { in: ["import.one@fixture.invalid", "import.two@fixture.invalid"] } },
        select: { email: true, status: true, passwordHash: true, roles: { select: { role: true } } },
      }),
    );
    expect(created).toHaveLength(2);
    for (const u of created) {
      // INVITED with no usable password — the invitee sets their own (M-O3).
      expect(u.status).toBe("INVITED");
      expect(u.passwordHash).toBeNull();
    }
    expect(created.find((u) => u.email.startsWith("import.one"))!.roles.map((r: { role: string }) => r.role)).toEqual(["ProjectManager"]);

    // Email is unconfigured in test, so the link comes back for the admin to hand over.
    expect(results.every((r) => r.status !== "invited" || Boolean(r.acceptUrl))).toBe(true);
  });

  it("a duplicate row fails alone — the batch still reports per row", async () => {
    const { rows } = parsePeopleCsv(CSV); // the same two people, already invited above
    const results = await importPeople(adminCtx, rows);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "error")).toBe(true);
    expect(results[0].message).toBeTruthy();
  });

  it("a plain member cannot invite anyone", async () => {
    const { rows } = parsePeopleCsv(CSV);
    await expect(importPeople(memberCtx, rows)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
