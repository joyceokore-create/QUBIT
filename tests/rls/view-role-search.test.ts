// UX3 — "Viewing as" (D2a) and ⌘K search. Requires a migrated, seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getViewState, setViewRole, ViewRoleError } from "@/server/preferences";
import { search } from "@/server/search";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("UX3 viewing as + search", () => {
  let rbId: string;
  let bId: string;
  let multi: TenantContext; // Executive + Project Manager
  let bCtx: TenantContext;
  let bProjectId: string;

  beforeAll(async () => {
    const [rb, b] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !b) throw new Error("Seed required.");
    rbId = rb.id;
    bId = b.id;
    const [[rbUser], [bUser]] = await Promise.all([createUsers(rbId, 1, "vas"), createUsers(bId, 1, "vas")]);
    multi = { tenantId: rbId, userId: rbUser.id, roles: ["Executive", "ProjectManager"] };
    bCtx = { tenantId: bId, userId: bUser.id, roles: ["PlatformSuperAdmin"] };
    bProjectId = (
      await withTenant(bCtx, (tx) =>
        tx.project.create({
          data: { tenantId: bId, code: "VASB1", name: "Zebrafish fixture B", type: "Project", priority: "Med", status: "OnTrack" },
          select: { id: true },
        }),
      )
    ).id;
  });

  afterAll(async () => {
    await withTenant(bCtx, (tx) => tx.project.deleteMany({ where: { id: bProjectId } }));
    await cleanupFixtureUsers(rbId);
    await cleanupFixtureUsers(bId);
    await prisma.$disconnect();
  });

  it("lands a multi-role person on their highest role, then remembers their choice", async () => {
    expect((await getViewState(multi)).viewRole).toBe("Executive");
    await setViewRole(multi, "ProjectManager");
    const after = await getViewState({ ...multi });
    expect(after.viewRole).toBe("ProjectManager");
    expect(after.showSwitch).toBe(true);
  });

  it("audits every switch as view_switch", async () => {
    await setViewRole(multi, "Executive");
    const rows = await withTenant(multi, (tx) =>
      tx.auditLog.findMany({ where: { action: "view_switch", entityId: multi.userId }, orderBy: { createdAt: "asc" }, select: { after: true } }),
    );
    expect(rows.map((r) => (r.after as { viewRole: string }).viewRole)).toEqual(["ProjectManager", "Executive"]);
  });

  it("refuses a role the person doesn't hold — the switch can't escalate", async () => {
    await expect(setViewRole(multi, "HeadOfProjects")).rejects.toBeInstanceOf(ViewRoleError);
    await expect(setViewRole(multi, "PlatformSuperAdmin")).rejects.toBeInstanceOf(ViewRoleError);
  });

  it("RLS: search never returns another tenant's records", async () => {
    const hitsA = await search(multi, "Zebrafish");
    expect(hitsA.some((h) => h.id === bProjectId)).toBe(false);
    const hitsB = await search(bCtx, "Zebrafish");
    expect(hitsB.some((h) => h.id === bProjectId && h.href === `/projects/${bProjectId}`)).toBe(true);
  });
});
