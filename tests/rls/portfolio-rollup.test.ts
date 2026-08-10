// M-P3b (docs/34) — the Head's roll-up: build is Head-only and idempotent; approve
// FREEZES the payload (later check-in changes never mutate what the Head signed);
// executives are notified; RLS isolation holds.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { approveRollup, buildRollup, getApprovedRollup, getRollup } from "@/server/portfolio-reports";
import { confirmCheckIn } from "@/server/checkins";
import { createUsers, cleanupFixtureUsers } from "./_users";

// A fixed 'now' inside an ISO week nobody else's suites touch (far future) so this
// suite's roll-up never collides with the live dev week.
const NOW = new Date("2027-03-10T12:00:00.000Z"); // 2027-W10

describe("M-P3b portfolio roll-up", () => {
  let rbId: string;
  let dbId: string;
  let headCtx: TenantContext;
  let execId: string;
  let projectId: string;

  beforeAll(async () => {
    const [rb, db] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [head, exec] = await createUsers(rbId, 2, "rlp");
    headCtx = { tenantId: rbId, userId: head.id, roles: ["HeadOfProjects"] };
    execId = exec.id;
    await withTenant(headCtx, (tx) =>
      tx.roleAssignment.create({ data: { tenantId: rbId, userId: execId, role: "Executive" } }),
    );
    projectId = (
      await withTenant(headCtx, (tx) =>
        tx.project.create({
          data: { tenantId: rbId, code: "RLP1", name: "rollup fixture", type: "Project", priority: "Med", status: "AtRisk", leadUserId: head.id },
          select: { id: true },
        }),
      )
    ).id;
  });

  afterAll(async () => {
    await withTenant(headCtx, async (tx) => {
      await tx.portfolioReport.deleteMany({ where: { isoWeek: "2027-W10" } });
      await tx.checkIn.deleteMany({ where: { projectId } });
      await tx.roleAssignment.deleteMany({ where: { userId: execId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("a PM cannot build or approve; the Head builds an idempotent draft", async () => {
    const pm: TenantContext = { tenantId: rbId, userId: "x", roles: ["ProjectManager"] };
    await expect(buildRollup(pm, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(approveRollup(pm, "nope", NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const first = await buildRollup(headCtx, NOW);
    const second = await buildRollup(headCtx, NOW);
    expect(first.status).toBe("Draft");
    expect(second.status).toBe("Draft");
    const rows = await withTenant(headCtx, (tx) => tx.portfolioReport.count({ where: { isoWeek: "2027-W10" } }));
    expect(rows).toBe(1); // upsert, never a second row
    expect(second.rows.some((r) => r.code === "RLP1")).toBe(true);
  });

  it("approve freezes the payload: later check-in changes do not mutate what was signed", async () => {
    await confirmCheckIn(headCtx, projectId, { narrative: "signed state" }, NOW);
    // DM1.73 (T7): the check-in was confirmed but never SENT to the Head — approving
    // without acknowledging that is now refused, so "Send to the Head" means something.
    await expect(
      approveRollup(headCtx, "Week held steady; RLP1 needs watching.", NOW),
    ).rejects.toMatchObject({ code: "UNSENT_CHECKINS" });
    const approved = await approveRollup(headCtx, "Week held steady; RLP1 needs watching.", NOW, {
      acknowledgeUnsent: true,
    });
    expect(approved.status).toBe("Approved");
    const signedRow = approved.rows.find((r) => r.code === "RLP1")!;
    expect(signedRow.narrative).toBe("signed state");

    // The world moves on after signing…
    await confirmCheckIn(headCtx, projectId, { narrative: "changed AFTER approval" }, NOW);
    const after = await getRollup(headCtx, NOW);
    expect(after.status).toBe("Approved");
    expect(after.rows.find((r) => r.code === "RLP1")!.narrative).toBe("signed state"); // frozen

    // …and a second approval is refused rather than silently replacing the signature.
    await expect(approveRollup(headCtx, "again", NOW)).rejects.toMatchObject({ code: "ALREADY_APPROVED" });
    await expect(buildRollup(headCtx, NOW)).rejects.toMatchObject({ code: "ALREADY_APPROVED" });
  });

  it("executives were notified and the hero read is available", async () => {
    const note = await withTenant(headCtx, (tx) =>
      tx.notification.findFirst({ where: { userId: execId, kind: "rollup.approved" } }),
    );
    expect(note?.message).toContain("roll-up is approved");
    const hero = await getApprovedRollup(headCtx, NOW);
    expect(hero?.narrative).toContain("held steady");
  });

  it("tenant B sees no roll-up", async () => {
    const dbCtx: TenantContext = { tenantId: dbId, userId: "test", roles: ["HeadOfProjects"] };
    const view = await getRollup(dbCtx, NOW);
    expect(view.status).toBe("None");
    expect(view.rows.find((r) => r.code === "RLP1")).toBeUndefined();
  });
});
