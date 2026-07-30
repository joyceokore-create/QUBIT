// M8-A gate checklists (docs/16 §6): closing a delivery checkpoint checks what the gate
// requires against live data and SOFT-blocks — the gate can still close, but only with a
// written reason that is stamped on the row and audited. Lessons learned gate closure.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { CheckpointError, getProjectCheckpoints, setCheckpointState } from "@/server/checkpoints";
import { addLesson, listLessons } from "@/server/lessons";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("M8-A gate checklists", () => {
  let kcbId: string;
  let leadId: string;
  let ctx: TenantContext;
  let projectId: string;
  let gateIds: Record<string, string> = {};

  beforeAll(async () => {
    const kcb = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!kcb) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    kcbId = kcb.id;
    const [lead] = await createUsers(kcbId, 1, "gate");
    leadId = lead.id;
    ctx = { tenantId: kcbId, userId: leadId, roles: ["Member"] };

    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const project = await tx.project.create({
        data: {
          tenantId: kcbId,
          code: `GT${Date.now() % 100000}`,
          name: "Gate Fixture",
          type: "Project",
          priority: "High",
          status: "OnTrack",
          // Deliberately NO lead and NO members — the BRD gate must notice.
        },
      });
      projectId = project.id;
      const tmpl = await tx.checkpointTemplate.findFirstOrThrow({
        where: { name: "Product build" },
        select: { id: true, checkpoints: { select: { id: true, name: true }, orderBy: { orderIndex: "asc" } } },
      });
      gateIds = Object.fromEntries(tmpl.checkpoints.map((c) => [c.name, c.id]));
      await tx.project.update({ where: { id: projectId }, data: { checkpointTemplateId: tmpl.id } });
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      await tx.domainEvent.deleteMany({ where: { type: "checkpoint.state_changed" } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(kcbId);
    await prisma.$disconnect();
  });

  it("states what each gate requires before anybody tries to close it", async () => {
    const view = await getProjectCheckpoints(ctx, projectId);
    const brd = view.rows.find((r) => r.name === "BRD")!;
    expect(brd.gate.map((g) => g.key).sort()).toEqual(["brd-approved", "team-allocated"]);
    expect(brd.gate.every((g) => !g.met)).toBe(true);
    // A gate nobody wrote rules for has none, and closes freely.
    const proto = view.rows.find((r) => r.name === "Prototype")!;
    expect(proto.gate).toEqual([]);
  });

  it("refuses Done while the checklist is unmet, naming what is missing", async () => {
    const err = await setCheckpointState(ctx, projectId, { checkpointId: gateIds.BRD, state: "Done" }).catch((e) => e);
    expect(err).toBeInstanceOf(CheckpointError);
    expect((err as CheckpointError).code).toBe("GATE_UNMET");
    expect((err as CheckpointError).unmet!.map((r) => r.key).sort()).toEqual(["brd-approved", "team-allocated"]);
    expect((err as CheckpointError).message).toContain("approved BRD");

    // The state did not change.
    const view = await getProjectCheckpoints(ctx, projectId);
    expect(view.rows.find((r) => r.name === "BRD")!.state).toBe("NotStarted");
  });

  it("a rules-free gate closes without ceremony", async () => {
    const view = await setCheckpointState(ctx, projectId, { checkpointId: gateIds.Prototype, state: "Done" });
    expect(view.rows.find((r) => r.name === "Prototype")!.state).toBe("Done");
  });

  it("soft-block: an override closes the gate, and the reason is stamped + audited", async () => {
    const view = await setCheckpointState(ctx, projectId, {
      checkpointId: gateIds.BRD,
      state: "Done",
      overrideReason: "Steering approved verbally; BRD upload follows Monday.",
    });
    const brd = view.rows.find((r) => r.name === "BRD")!;
    expect(brd.state).toBe("Done");
    expect(brd.overrideReason).toContain("Steering approved verbally");

    const [row, audit, event] = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      Promise.all([
        tx.checkpointStatus.findFirstOrThrow({
          where: { projectId, checkpointId: gateIds.BRD, orgUnitId: null },
          select: { overriddenById: true, overriddenAt: true },
        }),
        tx.auditLog.findFirst({ where: { entityType: "checkpoint_status", actorId: leadId }, orderBy: { createdAt: "desc" } }),
        tx.domainEvent.findFirst({ where: { type: "checkpoint.state_changed" }, orderBy: { createdAt: "desc" } }),
      ]),
    );
    expect(row.overriddenById).toBe(leadId); // who forced it
    expect(row.overriddenAt).not.toBeNull(); // and when
    expect((audit?.after as { gateOverridden?: boolean })?.gateOverridden).toBe(true);
    expect((event?.payload as { gateOverridden?: boolean })?.gateOverridden).toBe(true);
  });

  it("satisfying the requirements closes the gate with no override recorded", async () => {
    // Give the project a lead + member and a Final BRD — the gate's own conditions.
    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      await tx.project.update({ where: { id: projectId }, data: { leadUserId: leadId } });
      await tx.projectMember.create({ data: { tenantId: kcbId, projectId, userId: leadId, role: "Project Manager" } });
      await tx.projectDocument.create({
        data: { tenantId: kcbId, projectId, title: "Business requirements", kind: "BRD", status: "Final" },
      });
    });
    // Re-close it cleanly: reset then set Done with no reason at all.
    await setCheckpointState(ctx, projectId, { checkpointId: gateIds.BRD, state: "NotStarted" });
    const view = await setCheckpointState(ctx, projectId, { checkpointId: gateIds.BRD, state: "Done" });
    const brd = view.rows.find((r) => r.name === "BRD")!;
    expect(brd.state).toBe("Done");
    expect(brd.overrideReason).toBeNull(); // the override cleared — it wasn't needed
    expect(brd.gate.every((g) => g.met)).toBe(true);
  });

  it("the closure gate needs lessons learned, and recording one satisfies it", async () => {
    const err = await setCheckpointState(ctx, projectId, { checkpointId: gateIds["Go-Live"], state: "Done" }).catch((e) => e);
    expect((err as CheckpointError).unmet!.map((r) => r.key)).toContain("lessons-captured");

    await addLesson(ctx, projectId, {
      title: "Start the telco integration conversation a month earlier.",
      category: "Recommendation",
    });
    expect(await listLessons(ctx, projectId)).toHaveLength(1);

    const view = await getProjectCheckpoints(ctx, projectId);
    const goLive = view.rows.find((r) => r.name === "Go-Live")!;
    expect(goLive.gate.find((g) => g.key === "lessons-captured")!.met).toBe(true);
    // The handover document is still missing, so the gate is not open yet — the
    // checklist reports each requirement independently rather than as one blob.
    expect(goLive.gate.find((g) => g.key === "handover-approved")!.met).toBe(false);
  });

  it("RLS: another tenant sees neither the gates nor the lessons", async () => {
    const riverbank = await prisma.tenant.findUniqueOrThrow({ where: { slug: "riverbank" } });
    const [rvUser] = await createUsers(riverbank.id, 1, "gaterv");
    const rvCtx = { tenantId: riverbank.id, userId: rvUser.id, roles: ["Member"] };
    expect((await getProjectCheckpoints(rvCtx, projectId)).templateId).toBeNull();
    expect(await listLessons(rvCtx, projectId)).toEqual([]);
    await cleanupFixtureUsers(riverbank.id);
  });
});
