// M-D-A delivery checkpoints (docs/18 §2 + §3.1): gates are tenant-scoped data, state
// drives a DERIVED percentage that reaches the dashboard, Blocked demands a real
// blocker, every change is audited + evented, and markets are a KIND of org unit that
// never leaks across tenants.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import {
  CheckpointError,
  getProjectCheckpoints,
  listCheckpointTemplates,
  setCheckpointState,
  setProjectTemplate,
} from "@/server/checkpoints";
import { getPortfolioSections } from "@/server/pipeline";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("M-D-A delivery checkpoints", () => {
  let kcbId: string;
  let riverbankId: string;
  let leadId: string;
  let ctx: TenantContext;
  let projectId: string;
  let templateId: string;
  let gateIds: string[] = [];

  beforeAll(async () => {
    const [kcb, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!kcb || !riverbank) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    kcbId = kcb.id;
    riverbankId = riverbank.id;
    const [lead] = await createUsers(kcbId, 1, "cp");
    leadId = lead.id;
    ctx = { tenantId: kcbId, userId: leadId, roles: ["Member"] };

    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const project = await tx.project.create({
        data: {
          tenantId: kcbId,
          code: `CP${Date.now() % 100000}`,
          name: "Checkpoint Fixture",
          type: "Project",
          priority: "High",
          status: "OnTrack",
          leadUserId: leadId,
        },
      });
      projectId = project.id;
      const tmpl = await tx.checkpointTemplate.findFirstOrThrow({
        where: { name: "Product build" },
        select: { id: true, checkpoints: { select: { id: true }, orderBy: { orderIndex: "asc" } } },
      });
      templateId = tmpl.id;
      gateIds = tmpl.checkpoints.map((c) => c.id);

      // M8-A: closing the BRD gate now runs its checklist (docs/16 §6). This suite is
      // about the derived-% maths, so give the fixture what that gate asks for — an
      // allocated member and an approved BRD — rather than overriding past it.
      await tx.projectMember.create({ data: { tenantId: kcbId, projectId, userId: leadId, role: "Project Manager" } });
      await tx.projectDocument.create({
        data: { tenantId: kcbId, projectId, title: "Business requirements", kind: "BRD", status: "Approved" },
      });
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      await tx.domainEvent.deleteMany({ where: { type: "checkpoint.state_changed" } });
      await tx.project.deleteMany({ where: { id: projectId } }); // statuses cascade
    });
    await cleanupFixtureUsers(kcbId);
    await prisma.$disconnect();
  });

  it("seeds both §2 templates per tenant, with the documented gate lists", async () => {
    const templates = await listCheckpointTemplates(ctx);
    const byName = new Map(templates.map((t) => [t.name, t.checkpointCount]));
    expect(byName.get("Product build")).toBe(6); // BRD → Prototype → MVP1 → SIT → UAT → Go-Live
    expect(byName.get("Market rollout")).toBe(8); // Business Case → … → Rollout
  });

  it("attaching a template exposes every gate as NotStarted at 0%", async () => {
    const before = await getProjectCheckpoints(ctx, projectId);
    expect(before.templateId).toBeNull();
    expect(before.rows).toHaveLength(0);

    const after = await setProjectTemplate(ctx, projectId, templateId);
    expect(after.templateName).toBe("Product build");
    expect(after.rows).toHaveLength(6);
    expect(after.rows.every((r) => r.state === "NotStarted")).toBe(true);
    expect(after.progress).toBe(0);
  });

  it("derives % from gate state and reaches the dashboard (§2 — never typed)", async () => {
    await setCheckpointState(ctx, projectId, { checkpointId: gateIds[0], state: "Done" });
    await setCheckpointState(ctx, projectId, { checkpointId: gateIds[1], state: "Done" });
    const view = await setCheckpointState(ctx, projectId, { checkpointId: gateIds[2], state: "InProgress" });
    expect(view.progress).toBe(42); // (1 + 1 + 0.5) / 6

    // The exec surface shows the SAME number and the ordered ticks.
    const sections = await getPortfolioSections(ctx);
    const row = sections.sections.flatMap((s) => s.pipeline.groups.flatMap((g) => g.rows)).find((r) => r.id === projectId)!;
    expect(row.progress).toBe(42);
    expect(row.gates).toEqual(["Done", "Done", "InProgress", "NotStarted", "NotStarted", "NotStarted"]);
  });

  it("Blocked needs a real open blocker on THIS project (§2 flag pattern)", async () => {
    await expect(setCheckpointState(ctx, projectId, { checkpointId: gateIds[3], state: "Blocked" })).rejects.toThrowError(
      CheckpointError,
    );
    // A blocker from another project is refused too.
    const otherBlockerId = await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const other = await tx.project.findFirstOrThrow({ where: { id: { not: projectId } }, select: { id: true } });
      const b = await tx.blocker.create({
        data: { tenantId: kcbId, projectId: other.id, description: "Someone else's problem", severity: "Medium", status: "Open" },
      });
      return b.id;
    });
    await expect(
      setCheckpointState(ctx, projectId, { checkpointId: gateIds[3], state: "Blocked", blockerId: otherBlockerId }),
    ).rejects.toThrowError(CheckpointError);

    const mine = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.blocker.create({
        data: { tenantId: kcbId, projectId, description: "Vendor contract unsigned", severity: "Critical", status: "Open" },
        select: { id: true },
      }),
    );
    const view = await setCheckpointState(ctx, projectId, { checkpointId: gateIds[3], state: "Blocked", blockerId: mine.id });
    const blocked = view.rows.find((r) => r.checkpointId === gateIds[3])!;
    expect(blocked.state).toBe("Blocked");
    expect(blocked.blockerReason).toBe("Vendor contract unsigned");
    expect(view.progress).toBe(42); // Blocked earns nothing — the number does not move
  });

  it("rejects a checkpoint from a different template", async () => {
    const strayId = await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const other = await tx.checkpointTemplate.findFirstOrThrow({
        where: { name: "Market rollout" },
        select: { checkpoints: { select: { id: true }, take: 1 } },
      });
      return other.checkpoints[0].id;
    });
    await expect(setCheckpointState(ctx, projectId, { checkpointId: strayId, state: "Done" })).rejects.toThrowError(
      CheckpointError,
    );
  });

  it("audits and events every state change", async () => {
    const [audit, event] = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      Promise.all([
        tx.auditLog.findFirst({
          where: { entityType: "checkpoint_status", actorId: leadId },
          orderBy: { createdAt: "desc" },
        }),
        tx.domainEvent.findFirst({
          where: { type: "checkpoint.state_changed" },
          orderBy: { createdAt: "desc" },
        }),
      ]),
    );
    expect(audit).not.toBeNull();
    expect((event?.payload as { to?: string })?.to).toBeDefined();
    expect((event?.payload as { projectId?: string })?.projectId).toBe(projectId);
  });

  it("§3.1: markets are org units of kind Market, seeded for Riverbank only", async () => {
    const counts = async (tenantId: string) =>
      withTenant({ tenantId, userId: "test" }, async (tx) => ({
        markets: await tx.orgUnit.count({ where: { kind: "Market" } }),
        internal: await tx.orgUnit.count({ where: { kind: "Internal" } }),
      }));
    const rv = await counts(riverbankId);
    const kcb = await counts(kcbId);
    expect(rv.markets).toBe(7); // KE TZ UG RW BI SS DRC
    expect(rv.internal).toBeGreaterThanOrEqual(1); // Riverbank stays flat internally
    // KCB's subsidiaries are Internal — the markets belong to the Riverbank tenant.
    expect(kcb.markets).toBe(0);
    expect(kcb.internal).toBeGreaterThanOrEqual(5);
  });

  it("RLS: tenant B sees neither this project's gates nor tenant A's templates", async () => {
    const [rvUser] = await createUsers(riverbankId, 1, "cprv");
    const rvCtx = { tenantId: riverbankId, userId: rvUser.id, roles: ["Member"] };
    const view = await getProjectCheckpoints(rvCtx, projectId);
    expect(view.templateId).toBeNull(); // the project itself is invisible
    const rvTemplates = await listCheckpointTemplates(rvCtx);
    expect(rvTemplates.map((t) => t.id)).not.toContain(templateId);
    await cleanupFixtureUsers(riverbankId);
  });
});
