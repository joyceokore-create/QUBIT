// DM1.72 — the org-setup wizard is retired; bulk people import survived it and lives in
// Admin → Users. What matters: one bad row never costs the good ones, every invited
// person gets a usable invite and NO password, and inviting is permission-gated.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { parsePeopleCsv } from "@/lib/people-csv";
import { importPeople, previewImport } from "@/server/people-import";
import { createUsers, cleanupFixtureUsers } from "./_users";
import { disableSso, restoreSso } from "./_sso-env";

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
    // Import issues invite links, which only exist when SSO is off (see _sso-env).
    disableSso();
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
      await tx.projectMember.deleteMany({ where: { userId: { in: ids } } });
      await tx.notification.deleteMany({ where: { userId: { in: ids } } });
      await tx.project.updateMany({ where: { leadUserId: { in: ids } }, data: { leadUserId: null } });
      const fixtureProjects = await tx.project.findMany({ where: { code: { startsWith: "IMP-" } }, select: { id: true } });
      await tx.domainEvent.deleteMany({ where: { entityId: { in: fixtureProjects.map((p) => p.id) } } });
      await tx.auditLog.deleteMany({ where: { entityId: { in: fixtureProjects.map((p) => p.id) } } });
      await tx.project.deleteMany({ where: { code: { startsWith: "IMP-" } } });
      await tx.inviteToken.deleteMany({ where: { userId: { in: ids } } });
      await tx.roleAssignment.deleteMany({ where: { userId: { in: ids } } });
      await tx.auditLog.deleteMany({ where: { entityId: { in: ids } } });
      await tx.user.deleteMany({ where: { id: { in: ids } } });
    });
    await cleanupFixtureUsers(rbId);
    restoreSso();
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

  it("re-importing existing people updates them (the template is re-runnable) — never a duplicate account", async () => {
    const { rows } = parsePeopleCsv(CSV); // the same two people, already invited above
    const results = await importPeople(adminCtx, rows);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "updated" && !r.acceptUrl)).toBe(true);
    const count = await withTenant(adminCtx, (tx) => tx.user.count({ where: { email: { in: ["import.one@fixture.invalid", "import.two@fixture.invalid"] } } }));
    expect(count).toBe(2);
  });

  it("a plain member cannot invite anyone", async () => {
    const { rows } = parsePeopleCsv(CSV);
    await expect(importPeople(memberCtx, rows)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // ── PM onboarding (Oct 2026): projects in the file, re-runnable, lead set once ──

  it("assigns a new PM to their projects, makes them lead where none exists, and re-running updates instead of failing", async () => {
    const [first, second] = await withTenant(adminCtx, async (tx) => {
      const mk = (code: string, name: string) =>
        tx.project.create({ data: { tenantId: rbId, code, name, type: "Project", priority: "Med", status: "Planning" }, select: { id: true } });
      return Promise.all([mk("IMP-A", "Import fixture A"), mk("IMP-B", "Import fixture B")]);
    });
    const csv = "name,email,role,projects,group\nImport PM,import.pm@fixture.invalid,ProjectManager,IMP-A;IMP-B;IMP-NOPE,\n";
    const { rows } = parsePeopleCsv(csv);

    const preview = await previewImport(adminCtx, rows);
    expect(preview[0]).toMatchObject({ exists: false, projectsFound: ["IMP-A", "IMP-B"], unknownProjects: ["IMP-NOPE"] });

    const [r] = await importPeople(adminCtx, rows);
    expect(r).toMatchObject({ status: "invited", assigned: ["IMP-A", "IMP-B"], leadOf: ["IMP-A", "IMP-B"], unknownProjects: ["IMP-NOPE"] });

    const user = await withTenant(adminCtx, (tx) => tx.user.findFirstOrThrow({ where: { email: "import.pm@fixture.invalid" }, select: { id: true } }));
    const [members, projects] = await withTenant(adminCtx, (tx) =>
      Promise.all([
        tx.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true, role: true } }),
        tx.project.findMany({ where: { id: { in: [first.id, second.id] } }, select: { id: true, leadUserId: true } }),
      ]),
    );
    expect(members.map((m) => m.role)).toEqual(["Project Manager", "Project Manager"]);
    expect(projects.every((p) => p.leadUserId === user.id)).toBe(true);

    // A second PM on IMP-A joins as a member; the lead stays with the first.
    const [r2] = await importPeople(adminCtx, parsePeopleCsv("name,email,role,projects,group\nImport PM2,import.pm2@fixture.invalid,ProjectManager,IMP-A,\n").rows);
    expect(r2).toMatchObject({ assigned: ["IMP-A"], leadOf: [] });

    // Re-running the first file: updated, no duplicate membership, lead unchanged, nothing errors.
    const [again] = await importPeople(adminCtx, rows);
    expect(again).toMatchObject({ status: "updated", assigned: ["IMP-A", "IMP-B"], leadOf: [] });
    const count = await withTenant(adminCtx, (tx) => tx.projectMember.count({ where: { userId: user.id } }));
    expect(count).toBe(2);
    expect(await withTenant(adminCtx, (tx) => tx.project.findUniqueOrThrow({ where: { id: first.id }, select: { leadUserId: true } }))).toEqual({ leadUserId: user.id });
    expect((await previewImport(adminCtx, rows))[0]?.exists).toBe(true);
  });
});
