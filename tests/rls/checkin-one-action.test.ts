// Milestone A (docs handoff §1.2) — "Confirm & send to Head" is ONE act: confirm stamps
// submittedToHeadAt in the same transaction (two audit rows, two events, the Head's
// bell), a re-confirm RE-SENDS with a newer stamp, and "Save draft" keeps the PM's line
// and RAG choice without confirming anything — and never colours a surface. RLS holds.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { confirmCheckIn, getCurrentCheckIn, listProjectReports, saveCheckInDraft } from "@/server/checkins";
import { createUsers, cleanupFixtureUsers } from "./_users";

// A far-future week of its own, so this suite never collides with the live one.
const NOW = new Date("2027-11-10T10:00:00.000Z"); // 2027-W45
const WEEK = "2027-W45";

describe("Milestone A — one-action confirm & send, save draft", () => {
  let rbId: string;
  let dbId: string;
  let pmCtx: TenantContext;
  let headId: string;
  let projectId: string;

  beforeAll(async () => {
    const [rb, db] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [pm, head] = await createUsers(rbId, 2, "oa");
    pmCtx = { tenantId: rbId, userId: pm.id, roles: ["ProjectManager"] };
    headId = head.id;
    await withTenant(pmCtx, async (tx) => {
      await tx.roleAssignment.create({ data: { tenantId: rbId, userId: headId, role: "HeadOfProjects" } });
      projectId = (
        await tx.project.create({
          data: { tenantId: rbId, code: "OA1", name: "one-action fixture", type: "Project", priority: "Med", status: "OnTrack", leadUserId: pm.id },
          select: { id: true },
        })
      ).id;
    });
  });

  afterAll(async () => {
    await withTenant(pmCtx, async (tx) => {
      const ids = (await tx.checkIn.findMany({ where: { projectId }, select: { id: true } })).map((c) => c.id);
      await tx.domainEvent.deleteMany({ where: { entityType: "check_in", entityId: { in: ids } } });
      await tx.auditLog.deleteMany({ where: { entityType: "check_in", entityId: { in: ids } } });
      // Real Heads of PMs in riverbank get the fixture's "OA1 sent…" bell too — clear it.
      await tx.notification.deleteMany({ where: { kind: "checkin.submitted_to_head", message: { contains: "OA1" } } });
      await tx.checkIn.deleteMany({ where: { projectId } });
      await tx.roleAssignment.deleteMany({ where: { userId: headId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("save draft keeps the line and override WITHOUT confirming, sending, or colouring anything", async () => {
    const draft = await saveCheckInDraft(
      pmCtx,
      projectId,
      { narrative: "half-written line", ragOverride: "Red", overrideReason: "vendor outage" },
      NOW,
    );
    expect(draft.status).toBe("Draft");
    expect(draft.narrative).toBe("half-written line");
    expect(draft.ragOverride).toBe("Red");
    expect(draft.effectiveRag).toBe(draft.computedRag); // a draft override is a note to self, not a status
    expect(draft.buildRag).toBe(draft.computedRag);
    expect(draft.confirmedAt).toBeNull();
    expect(draft.submittedToHeadAt).toBeNull();
    expect(draft.overrideExpiresAt).toBeNull();

    // It reloads for the PM…
    const again = await getCurrentCheckIn(pmCtx, projectId, NOW);
    expect(again.narrative).toBe("half-written line");
    expect(again.ragOverride).toBe("Red");
    // …and is invisible to every report reader (Confirmed only).
    expect((await listProjectReports(pmCtx, projectId)).find((r) => r.isoWeek === WEEK)).toBeUndefined();

    const auditRow = await withTenant(pmCtx, (tx) =>
      tx.auditLog.findFirst({ where: { entityType: "check_in", entityId: draft.id! }, orderBy: { createdAt: "desc" } }),
    );
    expect(auditRow?.after).toMatchObject({ draftSaved: true, override: "Red" });
  });

  it("confirm sets BOTH stamps in one act: two audit rows, two events, and the Head's bell", async () => {
    const view = await confirmCheckIn(pmCtx, projectId, { narrative: "Shipped the KE pilot." }, NOW);
    expect(view.status).toBe("Confirmed");
    expect(view.confirmedAt).not.toBeNull();
    expect(view.submittedToHeadAt).not.toBeNull();

    const [audits, events, bell] = await withTenant(pmCtx, (tx) =>
      Promise.all([
        tx.auditLog.findMany({ where: { entityType: "check_in", entityId: view.id! } }),
        tx.domainEvent.findMany({ where: { entityType: "check_in", entityId: view.id! }, select: { type: true } }),
        tx.notification.findFirst({ where: { userId: headId, kind: "checkin.submitted_to_head" } }),
      ]),
    );
    const afters = audits.map((a) => a.after as Record<string, unknown>);
    expect(afters.some((a) => a.confirmed === true)).toBe(true);
    expect(afters.some((a) => a.submittedToHead === true)).toBe(true);
    const types = events.map((e) => e.type);
    expect(types).toContain("checkin.confirmed");
    expect(types).toContain("checkin.submitted_to_head");
    expect(bell?.message).toContain("OA1");
  });

  it("re-confirm RE-SENDS: a newer stamp and a second bell for the Head", async () => {
    const first = await getCurrentCheckIn(pmCtx, projectId, NOW);
    const again = await confirmCheckIn(pmCtx, projectId, { narrative: "Edited after a chat." }, new Date(NOW.getTime() + 60_000));
    expect(again.submittedToHeadAt!.getTime()).toBeGreaterThan(first.submittedToHeadAt!.getTime());
    const bells = await withTenant(pmCtx, (tx) =>
      tx.notification.count({ where: { userId: headId, kind: "checkin.submitted_to_head", message: { contains: "OA1" } } }),
    );
    expect(bells).toBe(2);
  });

  it("save draft is refused once the week is confirmed — edit and re-confirm instead", async () => {
    await expect(saveCheckInDraft(pmCtx, projectId, { narrative: "sneaky demotion" }, NOW)).rejects.toMatchObject({
      code: "ALREADY_CONFIRMED",
    });
  });

  it("nothing crosses tenants: demo-b cannot draft a riverbank project", async () => {
    const other: TenantContext = { tenantId: dbId, userId: "intruder", roles: ["ProjectManager"] };
    await expect(saveCheckInDraft(other, projectId, { narrative: "x" }, NOW)).rejects.toThrow();
  });
});
