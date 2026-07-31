// M7-B webhook processing (docs/15 §6.3) against the real database. The §6.3 "done when"
// list, verbatim: a push moves a task to InReview, #blocked raises a linked Blocker, a
// replayed delivery is a no-op, a payload naming another tenant's repo cannot touch this
// tenant, transitions are audited with the matched-committer actor — plus the M7-C
// interaction: a YouTrack-mirrored issue referenced by its tracker key links but never
// moves.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { encryptSecret } from "@/lib/secret-box";
import { processPush, resolveGithubIntegration, type PushPayload } from "@/server/connectors/github-webhook";
import { createUsers, cleanupFixtureUsers } from "./_users";

let seq = 0;
const nextDelivery = () => `gw-test-${process.pid}-${++seq}`;

describe("M7-B GitHub webhook", () => {
  let kcbId: string;
  let riverbankId: string;
  let projectId: string;
  let leadId: string;
  let devId: string;
  let devEmail: string;
  let riverbankTaskId: string;
  let ctx: TenantContext;
  const REPO = `acme/gw-fixture-${process.pid}`;
  const task: Record<string, string> = {};

  const commit = (id: string, message: string, email?: string) => ({
    id,
    message,
    url: `https://github.com/${REPO}/commit/${id}`,
    timestamp: "2026-07-31T10:00:00Z",
    author: { name: "Fixture Dev", email },
  });
  const payload = (commits: ReturnType<typeof commit>[]): PushPayload => ({
    repository: { full_name: REPO },
    commits,
  });

  beforeAll(async () => {
    const [kcb, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!kcb || !riverbank) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    kcbId = kcb.id;
    riverbankId = riverbank.id;
    const [lead, dev] = await createUsers(kcbId, 2, "gw");
    leadId = lead.id;
    devId = dev.id;
    ctx = { tenantId: kcbId, userId: leadId, roles: ["Member"] };

    await withTenant(ctx, async (tx) => {
      devEmail = (await tx.user.findUniqueOrThrow({ where: { id: devId }, select: { email: true } })).email;
      const project = await tx.project.create({
        data: {
          tenantId: kcbId, code: "GWFIX", name: "Webhook Fixture", type: "Project",
          priority: "High", status: "OnTrack", leadUserId: leadId,
        },
        select: { id: true },
      });
      projectId = project.id;
      await tx.projectIntegration.create({
        data: {
          tenantId: kcbId, projectId, provider: "github", connected: true,
          resource: REPO, webhookSecret: encryptSecret("gw-fixture-secret"),
        },
      });
      for (const [key, data] of [
        ["a", { taskKey: "GWFIX-1", title: "Wire the exporter", type: "Feature", status: "NotStarted" }],
        ["b", { taskKey: "GWFIX-2", title: "Fix rounding bug", type: "Bug", status: "InProgress", assigneeId: devId }],
        ["c", { taskKey: "GWFIX-3", title: "Already verified", type: "Chore", status: "Completed" }],
        ["m", { title: "Mirrored issue", status: "InProgress", sourceSystem: "youtrack", externalId: "2-77", externalKey: "RBC-77" }],
      ] as const) {
        const t = await tx.projectTask.create({ data: { tenantId: kcbId, projectId, ...data }, select: { id: true } });
        task[key] = t.id;
      }
    });

    // A same-key task in the OTHER tenant — the forgery canary.
    await withTenant({ tenantId: riverbankId, userId: "test" }, async (tx) => {
      const p = await tx.project.create({
        data: {
          tenantId: riverbankId, code: "GWFIX", name: "Riverbank Canary", type: "Project",
          priority: "Low", status: "OnTrack",
        },
        select: { id: true },
      });
      const t = await tx.projectTask.create({
        data: { tenantId: riverbankId, projectId: p.id, taskKey: "GWFIX-1", title: "Canary", status: "NotStarted" },
        select: { id: true },
      });
      riverbankTaskId = t.id;
    });
  });

  afterAll(async () => {
    await withTenant(ctx, async (tx) => {
      await tx.taskCommitLink.deleteMany({ where: { task: { projectId } } });
      await tx.webhookDelivery.deleteMany({ where: { deliveryId: { startsWith: `gw-test-${process.pid}` } } });
      await tx.blocker.deleteMany({ where: { projectId } });
      await tx.projectTask.deleteMany({ where: { projectId } });
      await tx.projectIntegration.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await withTenant({ tenantId: riverbankId, userId: "test" }, async (tx) => {
      await tx.projectTask.deleteMany({ where: { id: riverbankTaskId } });
      await tx.project.deleteMany({ where: { code: "GWFIX" } });
    });
    await cleanupFixtureUsers(kcbId);
    await prisma.$disconnect();
  });

  it("resolves the integration by OUR stored resource, case-insensitively", async () => {
    const hit = await resolveGithubIntegration(REPO.toUpperCase());
    expect(hit).toMatchObject({ tenantId: kcbId, projectId });
    expect(hit?.webhookSecret).toBe("gw-fixture-secret"); // decrypted, ready for HMAC
    expect(await resolveGithubIntegration("acme/never-configured")).toBeNull();
  });

  it("`fixes KEY` moves the task to InReview — never Completed — as the matched committer", async () => {
    const r = await processPush({ tenantId: kcbId, projectId }, payload([
      commit("c0ffee1", "fixes GWFIX-2: clamp the rate to 4dp", devEmail),
    ]), nextDelivery());
    expect(r).toMatchObject({ replay: false, linked: 1, moved: 1 });

    const t = await withTenant(ctx, (tx) => tx.projectTask.findUniqueOrThrow({ where: { id: task.b }, select: { status: true } }));
    expect(t.status).toBe("InReview");

    const entry = await withTenant(ctx, (tx) =>
      tx.auditLog.findFirst({
        where: { entityType: "project_task", entityId: task.b, action: "update" },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(entry?.actorId).toBe(devId); // the human who pushed, not the sentinel
  });

  it("#progress starts a NotStarted task and stores the commit link", async () => {
    const r = await processPush({ tenantId: kcbId, projectId }, payload([
      commit("c0ffee2", "GWFIX-1 #progress scaffolding the exporter", devEmail),
    ]), nextDelivery());
    expect(r.moved).toBe(1);
    const [t, link] = await withTenant(ctx, (tx) =>
      Promise.all([
        tx.projectTask.findUniqueOrThrow({ where: { id: task.a }, select: { status: true } }),
        tx.taskCommitLink.findUniqueOrThrow({
          where: { taskId_sha: { taskId: task.a, sha: "c0ffee2" } },
          select: { message: true, authorUserId: true, url: true },
        }),
      ]),
    );
    expect(t.status).toBe("InProgress");
    expect(link.message).toBe("GWFIX-1 #progress scaffolding the exporter");
    expect(link.authorUserId).toBe(devId);
  });

  it("#blocked raises a linked Blocker owned by the matched committer", async () => {
    const r = await processPush({ tenantId: kcbId, projectId }, payload([
      commit("c0ffee3", "GWFIX-1 #blocked waiting on treasury API creds", devEmail),
    ]), nextDelivery());
    expect(r.blocked).toBe(1);
    const blocker = await withTenant(ctx, (tx) =>
      tx.blocker.findFirstOrThrow({ where: { taskId: task.a, status: "Open" }, select: { description: true, ownerId: true } }),
    );
    expect(blocker.description).toBe("waiting on treasury API creds");
    expect(blocker.ownerId).toBe(devId);
  });

  it("an unmatched committer acts as the sentinel: ownerless blocker, link kept", async () => {
    const r = await processPush({ tenantId: kcbId, projectId }, payload([
      commit("c0ffee4", "GWFIX-2 #blocked flaky CI", "stranger@example.invalid"),
    ]), nextDelivery());
    expect(r.blocked).toBe(1);
    const blocker = await withTenant(ctx, (tx) =>
      tx.blocker.findFirstOrThrow({ where: { taskId: task.b, status: "Open" }, select: { ownerId: true } }),
    );
    expect(blocker.ownerId).toBeNull();
  });

  it("a replayed delivery is a recorded no-op", async () => {
    const deliveryId = nextDelivery();
    const first = await processPush({ tenantId: kcbId, projectId }, payload([
      commit("c0ffee5", "GWFIX-1 more scaffolding"),
    ]), deliveryId);
    expect(first.replay).toBe(false);
    const again = await processPush({ tenantId: kcbId, projectId }, payload([
      commit("c0ffee5", "GWFIX-1 more scaffolding"),
    ]), deliveryId);
    expect(again).toMatchObject({ replay: true, linked: 0, moved: 0, blocked: 0 });
  });

  it("ignores illegal transitions: Completed stays Completed", async () => {
    const r = await processPush({ tenantId: kcbId, projectId }, payload([
      commit("c0ffee6", "fixes GWFIX-3 (again)"),
    ]), nextDelivery());
    expect(r.moved).toBe(0);
    expect(r.ignored).toBeGreaterThanOrEqual(1);
    expect(r.linked).toBe(1); // the link is still worth keeping
    const t = await withTenant(ctx, (tx) => tx.projectTask.findUniqueOrThrow({ where: { id: task.c }, select: { status: true } }));
    expect(t.status).toBe("Completed");
  });

  it("a YouTrack-mirrored issue referenced by its tracker key LINKS but never moves", async () => {
    const r = await processPush({ tenantId: kcbId, projectId }, payload([
      commit("c0ffee7", "RBC-77 #done ported the fix", devEmail),
    ]), nextDelivery());
    expect(r.linked).toBe(1);
    expect(r.moved).toBe(0);
    expect(r.ignored).toBe(1);
    const t = await withTenant(ctx, (tx) =>
      tx.projectTask.findUniqueOrThrow({ where: { id: task.m }, select: { status: true } }),
    );
    expect(t.status).toBe("InProgress"); // YouTrack owns it
  });

  it("unknown keys are ignored, not errors", async () => {
    const r = await processPush({ tenantId: kcbId, projectId }, payload([
      commit("c0ffee8", "fixes NOPE-99 in a repo far away"),
    ]), nextDelivery());
    expect(r).toMatchObject({ moved: 0, linked: 0, ignored: 1 });
  });

  it("cross-tenant forgery: the same key in another tenant is untouchable", async () => {
    // The KCB integration processed pushes mentioning GWFIX-1 above; the Riverbank task
    // with the SAME key must be exactly as it started.
    const canary = await withTenant({ tenantId: riverbankId, userId: "test" }, (tx) =>
      tx.projectTask.findUniqueOrThrow({ where: { id: riverbankTaskId }, select: { status: true, commitLinks: { select: { id: true } } } }),
    );
    expect(canary.status).toBe("NotStarted");
    expect(canary.commitLinks).toEqual([]);
  });
});
