// UX7 — PM › Today and "Update an overdue milestone". Requires a migrated, seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getCockpitData } from "@/server/dashboard-cockpit";
import { getPmToday } from "@/server/pm-today";
import { MilestoneError, rescheduleMilestone, updateMilestone } from "@/server/milestones";
import { dayKey } from "@/lib/dates";
import { createUsers, cleanupFixtureUsers } from "./_users";

const TZ = "Africa/Nairobi";
const DAY = 86_400_000;

describe("UX7 PM Today", () => {
  let rbId: string;
  let bId: string;
  let pm: TenantContext;
  let bCtx: TenantContext;
  let mine: string;
  let notMine: string;
  let bProject: string;
  let overdueMs: string;
  const now = new Date();

  beforeAll(async () => {
    const [rb, b] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !b) throw new Error("Seed required.");
    rbId = rb.id;
    bId = b.id;
    const [[p, o], [bu]] = await Promise.all([createUsers(rbId, 2, "pmtoday"), createUsers(bId, 1, "pmtoday")]);
    pm = { tenantId: rbId, userId: p.id, roles: ["ProjectManager"] };
    bCtx = { tenantId: bId, userId: bu.id, roles: ["ProjectManager"] };

    ({ mine, notMine, overdueMs } = await withTenant(pm, async (tx) => {
      const a = await tx.project.create({
        data: { tenantId: rbId, code: "PMTA1", name: "PM Today fixture A", type: "Project", priority: "Med", status: "OnTrack", leadUserId: p.id },
        select: { id: true },
      });
      const c = await tx.project.create({
        data: { tenantId: rbId, code: "PMTA2", name: "PM Today fixture other", type: "Project", priority: "Med", status: "OnTrack", leadUserId: o.id },
        select: { id: true },
      });
      const ms = await tx.projectMilestone.create({
        data: { tenantId: rbId, projectId: a.id, name: "Fixture dry run", dueDate: new Date(now.getTime() - 4 * DAY) },
        select: { id: true },
      });
      await tx.projectMilestone.create({ data: { tenantId: rbId, projectId: c.id, name: "Other PM's milestone", dueDate: new Date(now.getTime() - 4 * DAY) } });
      await tx.projectMilestone.create({ data: { tenantId: rbId, projectId: a.id, name: "Fixture next week", dueDate: new Date(now.getTime() + 3 * DAY) } });
      return { mine: a.id, notMine: c.id, overdueMs: ms.id };
    }));
    bProject = await withTenant(bCtx, async (tx) => {
      const bp = await tx.project.create({
        data: { tenantId: bId, code: "PMTB1", name: "PM Today fixture B", type: "Project", priority: "Med", status: "OnTrack", leadUserId: bu.id },
        select: { id: true },
      });
      await tx.projectMilestone.create({ data: { tenantId: bId, projectId: bp.id, name: "B milestone", dueDate: new Date(now.getTime() - 4 * DAY) } });
      return bp.id;
    });
  });

  afterAll(async () => {
    await withTenant(pm, (tx) => tx.project.deleteMany({ where: { id: { in: [mine, notMine] } } }));
    await withTenant(bCtx, (tx) => tx.project.deleteMany({ where: { id: bProject } }));
    await cleanupFixtureUsers(rbId);
    await cleanupFixtureUsers(bId);
    await prisma.$disconnect();
  });

  it("covers only the projects the PM runs: overdue milestones, the week ahead, unsent update", async () => {
    const cockpit = await getCockpitData(pm, now);
    const t = await getPmToday(pm, cockpit.projects, now);
    expect(t.projects.map((p) => p.id)).toEqual([mine]);
    expect(t.overdueMilestones.map((m) => m.name)).toEqual(["Fixture dry run"]);
    expect(t.milestonesNext7).toBe(1);
    expect(t.projects[0].update).toBe("none");
  });

  it("RLS: never sees another tenant's projects or milestones", async () => {
    const cockpit = await getCockpitData(pm, now);
    expect(cockpit.projects.some((p) => p.id === bProject)).toBe(false);
    const t = await getPmToday({ ...bCtx, userId: pm.userId }, (await getCockpitData(bCtx, now)).projects, now);
    expect(t.overdueMilestones).toEqual([]);
  });

  it("refuses a past date, a date over two years out, and a done milestone", async () => {
    const todayKey = dayKey(now, TZ);
    const base = { reason: "Other" as const, goLiveEffect: "No change" as const, todayKey };
    const yesterday = dayKey(new Date(now.getTime() - DAY), TZ);
    await expect(rescheduleMilestone(pm, overdueMs, { ...base, newDate: yesterday, dueAt: new Date() })).rejects.toBeInstanceOf(MilestoneError);
    const far = dayKey(new Date(now.getTime() + 800 * DAY), TZ);
    await expect(rescheduleMilestone(pm, overdueMs, { ...base, newDate: far, dueAt: new Date() })).rejects.toThrow(/two years/);
  });

  it("moves the milestone, keeps the old date in the audit history, and emits milestone.rescheduled", async () => {
    const oldDue = await withTenant(pm, (tx) => tx.projectMilestone.findUniqueOrThrow({ where: { id: overdueMs }, select: { dueDate: true } }));
    const newKey = dayKey(new Date(now.getTime() + 5 * DAY), TZ);
    const dueAt = new Date(now.getTime() + 5 * DAY);
    await rescheduleMilestone(pm, overdueMs, { newDate: newKey, reason: "Vendor or third party late", goLiveEffect: "No change", note: "Synthetic note", dueAt, todayKey: dayKey(now, TZ) });

    const [row, auditRow, event] = await withTenant(pm, (tx) =>
      Promise.all([
        tx.projectMilestone.findUniqueOrThrow({ where: { id: overdueMs }, select: { dueDate: true } }),
        tx.auditLog.findFirst({ where: { entityType: "project_milestone", entityId: overdueMs }, orderBy: { createdAt: "desc" } }),
        tx.domainEvent.findFirst({ where: { type: "milestone.rescheduled", entityId: overdueMs } }),
      ]),
    );
    expect(row.dueDate?.getTime()).toBe(dueAt.getTime());
    expect(auditRow?.before).toMatchObject({ dueDate: oldDue.dueDate?.toISOString() });
    expect(auditRow?.after).toMatchObject({ rescheduled: true, reason: "Vendor or third party late", goLiveEffect: "No change", note: "Synthetic note" });
    expect(event?.payload).toMatchObject({ projectId: mine, goLiveEffect: "No change" });

    // It no longer counts as overdue on Today.
    const t = await getPmToday(pm, (await getCockpitData(pm, now)).projects, now);
    expect(t.overdueMilestones).toEqual([]);
  });

  it("audits name and due-date edits through the existing update path too", async () => {
    await updateMilestone(pm, overdueMs, { name: "Fixture dry run (renamed)" });
    const row = await withTenant(pm, (tx) => tx.auditLog.findFirst({ where: { entityType: "project_milestone", entityId: overdueMs }, orderBy: { createdAt: "desc" } }));
    expect(row?.before).toMatchObject({ name: "Fixture dry run" });
    expect(row?.after).toMatchObject({ name: "Fixture dry run (renamed)" });
  });
});
