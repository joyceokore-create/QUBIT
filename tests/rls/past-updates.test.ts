// UX12 (D13) — Reports › History past updates. Requires a migrated, seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { listMyPastUpdates } from "@/server/past-updates";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("UX12 past updates", () => {
  let rbId: string;
  let bId: string;
  let pm: TenantContext;
  let bCtx: TenantContext;
  const ids: { rb: string[]; b: string[] } = { rb: [], b: [] };

  beforeAll(async () => {
    const [rb, b] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !b) throw new Error("Seed required.");
    rbId = rb.id;
    bId = b.id;
    const [[p, other], [bu]] = await Promise.all([createUsers(rbId, 2, "pastupd"), createUsers(bId, 1, "pastupd")]);
    pm = { tenantId: rbId, userId: p.id, roles: ["ProjectManager"] };
    bCtx = { tenantId: bId, userId: bu.id, roles: ["ProjectManager"] };
    const mk = (ctx: TenantContext, tenantId: string, code: string, lead: string) =>
      withTenant(ctx, async (tx) => {
        const proj = await tx.project.create({ data: { tenantId, code, name: `Past updates ${code}`, type: "Project", priority: "Med", status: "OnTrack", leadUserId: lead }, select: { id: true } });
        await tx.checkIn.createMany({
          data: [
            { tenantId, projectId: proj.id, isoWeek: "2026-W40", status: "Confirmed", computedRag: "Amber", narrative: `Line ${code}` },
            { tenantId, projectId: proj.id, isoWeek: "2026-W41", status: "Draft", computedRag: "Green" },
          ],
        });
        return proj.id;
      });
    ids.rb.push(await mk(pm, rbId, "PUA1", p.id), await mk(pm, rbId, "PUA2", other.id));
    ids.b.push(await mk(bCtx, bId, "PUB1", bu.id));
  });

  afterAll(async () => {
    await withTenant(pm, (tx) => tx.project.deleteMany({ where: { id: { in: ids.rb } } }));
    await withTenant(bCtx, (tx) => tx.project.deleteMany({ where: { id: { in: ids.b } } }));
    await cleanupFixtureUsers(rbId);
    await cleanupFixtureUsers(bId);
    await prisma.$disconnect();
  });

  it("lists only CONFIRMED updates of projects the PM runs", async () => {
    const rows = await listMyPastUpdates(pm);
    expect(rows.map((r) => [r.projectCode, r.isoWeek, r.rag, r.narrative])).toEqual([["PUA1", "2026-W40", "Amber", "Line PUA1"]]);
  });

  it("RLS: never another tenant's, even with a spoofed user id", async () => {
    expect(await listMyPastUpdates({ ...bCtx, userId: pm.userId })).toEqual([]);
    expect((await listMyPastUpdates(bCtx)).map((r) => r.projectCode)).toEqual(["PUB1"]);
  });
});
