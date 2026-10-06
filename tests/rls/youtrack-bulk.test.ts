// Admin › Integrations — bulk YouTrack connect: every row through setIntegration (token
// encrypted, config kept), the first sync as the proof, nothing aborting the batch, the
// flag and the permission gates, and no reach across tenants. The connector's network call
// is mocked: the rules are what's under test, not YouTrack.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createUsers, cleanupFixtureUsers } from "./_users";

const { syncProject } = vi.hoisted(() => ({ syncProject: vi.fn() }));
vi.mock("@/server/connectors/youtrack-sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/connectors/youtrack-sync")>();
  return { ...actual, syncProject };
});

const { bulkConnectYoutrack, bulkDisconnectYoutrack, listYoutrackConnections } = await import("@/server/youtrack-bulk");
const { SyncError } = await import("@/server/connectors/youtrack-sync");
const { decryptSecret } = await import("@/lib/secret-box");

describe("Admin › Integrations — bulk YouTrack connect", () => {
  let rbId: string;
  let dbId: string;
  let head: TenantContext;
  let pm: TenantContext;
  let a: string;
  let b: string;
  let foreign: string;

  beforeAll(async () => {
    vi.stubEnv("FEATURE_YOUTRACK", "1");
    const [rb, db] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [h, p] = await createUsers(rbId, 2, "ytb");
    head = { tenantId: rbId, userId: h.id, roles: ["HeadOfProjects"] };
    pm = { tenantId: rbId, userId: p.id, roles: ["ProjectManager"] };
    const mk = (ctx: TenantContext, code: string) =>
      withTenant(ctx, (tx) => tx.project.create({ data: { tenantId: ctx.tenantId, code, name: `Bulk ${code}`, type: "Project", priority: "Med", status: "Planning" }, select: { id: true } }));
    [a, b] = await Promise.all([mk(head, "YTB-A").then((x) => x.id), mk(head, "YTB-B").then((x) => x.id)]);
    foreign = (await mk({ tenantId: dbId, userId: "seed", roles: ["HeadOfProjects"] }, "YTB-X")).id;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await withTenant(head, async (tx) => {
      await tx.projectIntegration.deleteMany({ where: { projectId: { in: [a, b] } } });
      await tx.auditLog.deleteMany({ where: { actorId: head.userId } });
      await tx.project.deleteMany({ where: { id: { in: [a, b] } } });
    });
    await withTenant({ tenantId: dbId, userId: "seed" }, (tx) => tx.project.deleteMany({ where: { id: foreign } }));
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("connects every row, proves it with the first sync, keeps going past a failing one, never crosses a tenant", async () => {
    syncProject.mockImplementation(async (_ctx: unknown, projectId: string) => {
      if (projectId === b) throw new SyncError("YouTrack rejected the token.", "AUTH");
      return { projectId, projectCode: "YTB-A", created: 2, updated: 1, unchanged: 0, skipped: 0, unmatchedAssignees: [], truncated: false };
    });
    const out = await bulkConnectYoutrack(head, {
      baseUrl: "https://example.youtrack.cloud",
      token: "perm:fixture-token",
      syncNow: true,
      rows: [
        { projectId: a, project: "YA" },
        { projectId: b, project: "YB" },
        { projectId: foreign, project: "YX" },
      ],
    });
    expect(out).toMatchObject([
      { projectId: a, code: "YTB-A", outcome: "connected", synced: { created: 2, updated: 1, unchanged: 0, skipped: 0 } },
      { projectId: b, code: "YTB-B", outcome: "error", message: expect.stringContaining("rejected the token") },
      { projectId: foreign, code: "?", outcome: "error", message: "No such project." },
    ]);

    const rows = await withTenant(head, (tx) => tx.projectIntegration.findMany({ where: { projectId: { in: [a, b] }, provider: "youtrack" }, select: { projectId: true, connected: true, resource: true, secret: true, config: true } }));
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.connected).toBe(true);
      expect(r.secret).not.toBe("perm:fixture-token");
      expect(decryptSecret(r.secret!)).toBe("perm:fixture-token");
      expect(r.config).toMatchObject({ baseUrl: "https://example.youtrack.cloud" });
    }
    // The other tenant has no row at all.
    const other = await withTenant({ tenantId: dbId, userId: "seed" }, (tx) => tx.projectIntegration.count({ where: { projectId: foreign } }));
    expect(other).toBe(0);

    // The list shows the state without the secret.
    const listed = await listYoutrackConnections(head);
    const la = listed.find((r) => r.projectId === a)!;
    expect(la).toMatchObject({ code: "YTB-A", connected: true, resource: "YA", hasToken: true, baseUrl: "https://example.youtrack.cloud" });
    expect(JSON.stringify(la)).not.toContain("perm:");
  });

  it("re-running without a token keeps the stored one; a project with none stored asks for it", async () => {
    syncProject.mockResolvedValue({ projectId: a, projectCode: "YTB-A", created: 0, updated: 0, unchanged: 3, skipped: 0, unmatchedAssignees: [], truncated: false });
    const [again] = await bulkConnectYoutrack(head, { baseUrl: "https://example.youtrack.cloud", syncNow: false, rows: [{ projectId: a, project: "YA2" }] });
    expect(again).toMatchObject({ outcome: "connected" });
    const row = await withTenant(head, (tx) => tx.projectIntegration.findUniqueOrThrow({ where: { projectId_provider: { projectId: a, provider: "youtrack" } }, select: { resource: true, secret: true } }));
    expect(row.resource).toBe("YA2");
    expect(decryptSecret(row.secret!)).toBe("perm:fixture-token");

    await bulkDisconnectYoutrack(head, [a]);
    const cleared = await withTenant(head, (tx) => tx.projectIntegration.findUniqueOrThrow({ where: { projectId_provider: { projectId: a, provider: "youtrack" } }, select: { connected: true, secret: true } }));
    expect(cleared).toEqual({ connected: false, secret: null });
    const [noToken] = await bulkConnectYoutrack(head, { baseUrl: "https://example.youtrack.cloud", syncNow: false, rows: [{ projectId: a, project: "YA" }] });
    expect(noToken).toMatchObject({ outcome: "error", message: expect.stringContaining("enter the token") });
  });

  it("is gated: PMs cannot, and nothing happens while the feature is off", async () => {
    await expect(bulkConnectYoutrack(pm, { baseUrl: "https://example.youtrack.cloud", token: "perm:x", syncNow: false, rows: [{ projectId: a, project: "YA" }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listYoutrackConnections(pm)).rejects.toMatchObject({ code: "FORBIDDEN" });
    vi.stubEnv("FEATURE_YOUTRACK", "");
    await expect(bulkConnectYoutrack(head, { baseUrl: "https://example.youtrack.cloud", token: "perm:x", syncNow: false, rows: [{ projectId: a, project: "YA" }] })).rejects.toMatchObject({ code: "DISABLED" });
    vi.stubEnv("FEATURE_YOUTRACK", "1");
  });
});
