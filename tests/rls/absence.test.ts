// M6-A absence-aware resourcing (docs/16 §5): leave lowers capacity, badges the person,
// and stops the nudger pinging somebody who is away — rerouting to the PM instead of
// dropping the nudge. All tenant-scoped.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { AbsenceError, createAbsence, deleteAbsence, listAbsences } from "@/server/absence";
import { listWorkload } from "@/server/resources";
import { applyCandidates, type NudgeCandidate } from "@/server/nudger";
import { createUsers, cleanupFixtureUsers } from "./_users";

const DAY = 86_400_000;

describe("M6-A absence & capacity", () => {
  let kcbId: string;
  let awayId: string;
  let pmId: string;
  let ctx: TenantContext;
  let projectId: string;
  let absenceId: string;
  const now = new Date();

  beforeAll(async () => {
    const kcb = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!kcb) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    kcbId = kcb.id;
    const [away, pm] = await createUsers(kcbId, 2, "abs");
    awayId = away.id;
    pmId = pm.id;
    ctx = { tenantId: kcbId, userId: pmId, roles: ["ProjectManager"] };

    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const project = await tx.project.create({
        data: {
          tenantId: kcbId,
          code: `AB${Date.now() % 100000}`,
          name: "Absence Fixture",
          type: "Project",
          priority: "High",
          status: "OnTrack",
          leadUserId: pmId,
        },
      });
      projectId = project.id;
      await tx.projectMember.createMany({
        data: [
          { tenantId: kcbId, projectId, userId: awayId, role: "Developer", allocationPct: 100 },
          { tenantId: kcbId, projectId, userId: pmId, role: "Project Manager", allocationPct: 50 },
        ],
      });
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      await tx.absence.deleteMany({ where: { userId: { in: [awayId, pmId] } } });
      await tx.nudge.deleteMany({ where: { entityId: projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(kcbId);
    await prisma.$disconnect();
  });

  it("records an absence by hand and audits it", async () => {
    const rows = await createAbsence(ctx, {
      userId: awayId,
      type: "Leave",
      startDate: new Date(now.getTime() - DAY).toISOString(),
      endDate: new Date(now.getTime() + 20 * DAY).toISOString(),
      note: "Annual leave",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("manual");
    absenceId = rows[0].id;

    const audit = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.auditLog.findFirst({ where: { entityType: "absence", actorId: pmId }, orderBy: { createdAt: "desc" } }),
    );
    expect((audit?.after as { userId?: string })?.userId).toBe(awayId);
  });

  it("rejects an absence that ends before it starts", async () => {
    const bad = await createAbsence(ctx, {
      userId: awayId,
      type: "Leave",
      startDate: new Date(now.getTime() + 5 * DAY).toISOString(),
      endDate: new Date(now.getTime() + DAY).toISOString(),
    }).catch((e) => e);
    // The engine enforces it, not just the route — every caller gets the guard.
    expect(bad).toBeInstanceOf(AbsenceError);
    expect((bad as AbsenceError).code).toBe("BAD_INPUT");
    // …and nothing was written.
    const rows = await listAbsences(ctx, { userId: awayId, from: now, to: new Date(now.getTime() + 60 * DAY) });
    expect(rows).toHaveLength(1);
  });

  it("capacity drops with leave — no more 'on leave but 100% allocated'", async () => {
    const workload = await listWorkload(ctx, now);
    const away = workload.find((w) => w.userId === awayId)!;
    const present = workload.find((w) => w.userId === pmId)!;

    expect(away.totalPct).toBe(100); // the typed allocation is unchanged — both are true
    expect(away.effectivePct).toBe(0); // …but they are away the whole fortnight
    expect(away.availability).toBe(0);
    expect(away.onLeaveUntil).not.toBeNull();

    // Somebody with no leave is untouched.
    expect(present.effectivePct).toBe(present.totalPct);
    expect(present.availability).toBe(1);
    expect(present.onLeaveUntil).toBeNull();
  });

  it("the nudger does not ping an absent person, and reroutes to the PM", async () => {
    const candidate: NudgeCandidate = {
      signal: "task_due",
      entityType: "project_task",
      entityId: projectId, // any stable id — the dedupe key is what matters here
      projectId,
      message: "Something needs doing",
      link: null,
      level: 0,
      recipientsByLevel: [[awayId]],
    };
    const result = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      applyCandidates(tx, { tenantId: kcbId, userId: "job:test" }, [candidate], now),
    );
    expect(result.created).toBe(1);

    const nudge = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.nudge.findFirstOrThrow({ where: { entityId: projectId }, select: { recipientIds: true } }),
    );
    // The absent person is not pinged…
    expect(nudge.recipientIds).not.toContain(awayId);
    // …but the nudge is not lost either: the project's PM picks it up.
    expect(nudge.recipientIds).toContain(pmId);
  });

  it("only manual absences can be deleted — imported ones belong to their source", async () => {
    const importedId = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.absence
        .create({
          data: {
            tenantId: kcbId, userId: awayId, type: "Leave", source: "erp",
            startDate: new Date(now.getTime() + 40 * DAY), endDate: new Date(now.getTime() + 44 * DAY),
          },
        })
        .then((a) => a.id),
    );
    await expect(deleteAbsence(ctx, importedId)).rejects.toThrowError(AbsenceError);
    await deleteAbsence(ctx, absenceId); // the manual one goes
    const remaining = await listAbsences(ctx, { userId: awayId, from: now, to: new Date(now.getTime() + 60 * DAY) });
    expect(remaining.map((r) => r.source)).toEqual(["erp"]);
  });

  it("RLS: the other tenant sees none of these absences", async () => {
    const riverbank = await prisma.tenant.findUniqueOrThrow({ where: { slug: "riverbank" } });
    const [rvUser] = await createUsers(riverbank.id, 1, "absrv");
    const rvCtx = { tenantId: riverbank.id, userId: rvUser.id, roles: ["Member"] };
    const rows = await listAbsences(rvCtx, {}, now);
    expect(rows.some((r) => r.userId === awayId)).toBe(false);
    await cleanupFixtureUsers(riverbank.id);
  });
});
