// M6-B — where absence-awareness changes a DECISION rather than a number (docs/16 §5):
// the assignment warning with suggested alternates, next week's leave exposure for the
// Friday report, and the CSV bridge's idempotency.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { assignmentWarning, leaveExposureNextWeek } from "@/server/absence";
import { importAbsenceCsv } from "@/server/connectors/hr-absence";
import { createUsers, cleanupFixtureUsers } from "./_users";

const DAY = 86_400_000;

describe("M6-B absence reactions", () => {
  let demoBId: string;
  let awayId: string;
  let freeId: string;
  let busyId: string;
  let otherRoleId: string;
  let ctx: TenantContext;
  let projectId: string;
  let emails: Record<string, string> = {};
  const now = new Date();
  const dueInsideLeave = new Date(now.getTime() + 3 * DAY);

  beforeAll(async () => {
    const demoB = await prisma.tenant.findUnique({ where: { slug: "demo-b" } });
    if (!demoB) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    demoBId = demoB.id;
    const [away, free, busy, other] = await createUsers(demoBId, 4, "react");
    awayId = away.id;
    freeId = free.id;
    busyId = busy.id;
    otherRoleId = other.id;
    ctx = { tenantId: demoBId, userId: freeId, roles: ["ProjectManager"] };

    await withTenant({ tenantId: demoBId, userId: "test" }, async (tx) => {
      const project = await tx.project.create({
        data: {
          tenantId: demoBId, code: `RX${Date.now() % 100000}`, name: "Reactions Fixture",
          type: "Project", priority: "High", status: "OnTrack", leadUserId: freeId,
        },
      });
      projectId = project.id;
      await tx.projectMember.createMany({
        data: [
          { tenantId: demoBId, projectId, userId: awayId, role: "Developer", allocationPct: 100 },
          { tenantId: demoBId, projectId, userId: freeId, role: "Developer", allocationPct: 20 },
          { tenantId: demoBId, projectId, userId: busyId, role: "Developer", allocationPct: 90 },
          { tenantId: demoBId, projectId, userId: otherRoleId, role: "QA Engineer", allocationPct: 10 },
        ],
      });
      // The assignee is away across the due date.
      await tx.absence.create({
        data: {
          tenantId: demoBId, userId: awayId, type: "Leave", source: "manual",
          startDate: new Date(now.getTime() + DAY), endDate: new Date(now.getTime() + 6 * DAY),
        },
      });
      const users = await tx.user.findMany({
        where: { id: { in: [awayId, freeId, busyId, otherRoleId] } },
        select: { id: true, email: true },
      });
      emails = Object.fromEntries(users.map((u) => [u.id, u.email]));
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId: demoBId, userId: "test" }, async (tx) => {
      await tx.absence.deleteMany({ where: { userId: { in: [awayId, freeId, busyId, otherRoleId] } } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(demoBId);
    await prisma.$disconnect();
  });

  it("warns when the due date falls inside the assignee's leave, and suggests alternates", async () => {
    const w = await assignmentWarning(ctx, projectId, awayId, dueInsideLeave);
    expect(w.conflict).toBe(true);
    expect(w.until).not.toBeNull();

    // Same role only — the QA Engineer is not offered for a Developer's task…
    expect(w.alternates.map((a) => a.userId)).not.toContain(otherRoleId);
    // …the assignee is not offered to themselves…
    expect(w.alternates.map((a) => a.userId)).not.toContain(awayId);
    // …and the least-loaded developer leads the list (20% before 90%).
    expect(w.alternates[0].userId).toBe(freeId);
    expect(w.alternates.map((a) => a.userId)).toContain(busyId);
  });

  it("stays quiet when the date is outside the leave, or there is no date at all", async () => {
    const after = await assignmentWarning(ctx, projectId, awayId, new Date(now.getTime() + 30 * DAY));
    expect(after.conflict).toBe(false);
    expect(await assignmentWarning(ctx, projectId, awayId, null)).toMatchObject({ conflict: false });
    expect(await assignmentWarning(ctx, projectId, null, dueInsideLeave)).toMatchObject({ conflict: false });
    // Somebody who is around raises nothing.
    expect(await assignmentWarning(ctx, projectId, freeId, dueInsideLeave)).toMatchObject({ conflict: false });
  });

  it("does not suggest an alternate who is also away that day", async () => {
    await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.absence.create({
        data: {
          tenantId: demoBId, userId: freeId, type: "Training", source: "manual",
          startDate: new Date(now.getTime() + 2 * DAY), endDate: new Date(now.getTime() + 4 * DAY),
        },
      }),
    );
    const w = await assignmentWarning(ctx, projectId, awayId, dueInsideLeave);
    expect(w.alternates.map((a) => a.userId)).not.toContain(freeId); // now away too
    expect(w.alternates.map((a) => a.userId)).toContain(busyId); // loaded, but present
  });

  it("reports next week's exposure for the Friday report", async () => {
    const exposure = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      leaveExposureNextWeek(tx, now),
    );
    expect(exposure.peopleAway).toBeGreaterThanOrEqual(2); // the away dev + the free dev
    const fixture = exposure.projects.find((p) => p.projectName === "Reactions Fixture")!;
    expect(fixture.away).toBe(2);
    expect(fixture.members).toBe(4);
  });

  it("CSV import is idempotent on externalRef and reports what it could not read", async () => {
    const csv = [
      "email,type,start,end,ref",
      `${emails[busyId]},Leave,2026-09-01,2026-09-04,HR-77`,
      "ghost@example.invalid,Leave,2026-09-01,2026-09-04,HR-78",
      "broken-row,Leave,2026-09-01,2026-09-04",
    ].join("\n");

    const first = await importAbsenceCsv(ctx, csv);
    expect(first.created).toBe(1);
    expect(first.unknownPeople).toEqual(["ghost@example.invalid"]);
    expect(first.rejected).toEqual([{ line: 4, reason: "no email address" }]);

    // Re-running the same export corrects in place rather than stacking duplicates.
    const second = await importAbsenceCsv(ctx, csv.replace("2026-09-04", "2026-09-05"));
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);

    const rows = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.absence.findMany({ where: { userId: busyId, source: "import" }, select: { endDate: true } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].endDate.toISOString().slice(0, 10)).toBe("2026-09-05");
  });

  it("RLS: the other tenant imports nothing from this tenant's people", async () => {
    const riverbank = await prisma.tenant.findUniqueOrThrow({ where: { slug: "riverbank" } });
    const [rvUser] = await createUsers(riverbank.id, 1, "reactrv");
    const rvCtx = { tenantId: riverbank.id, userId: rvUser.id, roles: ["ProjectManager"] };
    const res = await importAbsenceCsv(rvCtx, `email,type,start,end,ref\n${emails[busyId]},Leave,2026-09-01,2026-09-04,HR-99`);
    expect(res.created).toBe(0);
    expect(res.unknownPeople).toEqual([emails[busyId]]); // invisible across the boundary
    await cleanupFixtureUsers(riverbank.id);
  });
});
