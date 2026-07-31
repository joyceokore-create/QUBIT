// M7-C YouTrack → ProjectTask mirroring (BRD FR-INT-05). Only the NETWORK call is mocked;
// every mapping, upsert, audit and RLS path below is the real one.
//
// The properties that matter: a re-sync of unchanged issues writes nothing, assignees
// match by email and never across tenants, YouTrack-owned fields refuse local edits, a
// connected project refuses new native tasks, and mirrored rows count toward progress.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above the imports, so the spy has to be hoisted with it.
const { fetchIssues } = vi.hoisted(() => ({ fetchIssues: vi.fn() }));
vi.mock("@/server/connectors/youtrack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/connectors/youtrack")>()),
  fetchIssues,
}));

import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { encryptSecret } from "@/lib/secret-box";
import { syncProject, SyncError } from "@/server/connectors/youtrack-sync";
import { getProjectProgress, listProjectTasks, addTasks, updateTask, removeTask, TaskError } from "@/server/project-tasks";
import type { YoutrackIssue } from "@/server/connectors/youtrack";
import { createUsers, cleanupFixtureUsers } from "./_users";

const BASE = "https://acme.youtrack.cloud";

const issue = (over: Partial<YoutrackIssue> & { state?: string; assigneeEmail?: string } = {}): YoutrackIssue => {
  const { state = "In Progress", assigneeEmail, ...rest } = over;
  return {
    id: "2-1",
    idReadable: "RBC-1",
    summary: "Statement export truncates",
    updated: Date.parse("2026-07-30T09:00:00Z"),
    customFields: [
      { name: "State", value: { name: state } },
      { name: "Type", value: { name: "Bug" } },
      { name: "Priority", value: { name: "Major" } },
      ...(assigneeEmail ? [{ name: "Assignee", value: { login: "u", email: assigneeEmail, fullName: "Mapped Person" } }] : []),
    ],
    ...rest,
  };
};

const respond = (issues: YoutrackIssue[], truncated = false) => {
  fetchIssues.mockResolvedValue({ issues, truncated });
};

describe("M7-C YouTrack sync", () => {
  let kcbId: string;
  let riverbankId: string;
  let projectId: string;
  let leadId: string;
  let devId: string;
  let devEmail: string;
  let ctx: TenantContext;

  beforeAll(async () => {
    const [kcb, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!kcb || !riverbank) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    kcbId = kcb.id;
    riverbankId = riverbank.id;

    const [lead, dev] = await createUsers(kcbId, 2, "yt");
    leadId = lead.id;
    devId = dev.id;
    ctx = { tenantId: kcbId, userId: leadId, roles: ["Member"] };

    await withTenant(ctx, async (tx) => {
      devEmail = (await tx.user.findUniqueOrThrow({ where: { id: devId }, select: { email: true } })).email;
      const project = await tx.project.create({
        data: {
          tenantId: kcbId,
          code: `YT${Date.now() % 100000}`,
          name: "YouTrack Fixture",
          type: "Project",
          priority: "High",
          status: "OnTrack",
          leadUserId: leadId,
        },
      });
      projectId = project.id;
      await tx.projectIntegration.create({
        data: {
          tenantId: kcbId,
          projectId,
          provider: "youtrack",
          connected: true,
          resource: "RBC",
          secret: encryptSecret("perm:test-token"),
          config: { baseUrl: BASE },
        },
      });
    });
  });

  beforeEach(() => {
    fetchIssues.mockReset();
  });

  afterAll(async () => {
    await withTenant(ctx, async (tx) => {
      await tx.auditLog.deleteMany({ where: { entityType: "project_integration", entityId: { contains: projectId } } });
      await tx.projectIntegration.deleteMany({ where: { projectId } });
      await tx.projectTask.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(kcbId);
    await prisma.$disconnect();
  });

  it("creates a mirrored task carrying its tracker identity", async () => {
    respond([issue()]);
    const r = await syncProject(ctx, projectId);
    expect(r.created).toBe(1);
    expect(r.updated).toBe(0);

    const [task] = await listProjectTasks(ctx, projectId);
    expect(task.sourceSystem).toBe("youtrack");
    expect(task.externalKey).toBe("RBC-1");
    expect(task.externalUrl).toBe(`${BASE}/issue/RBC-1`);
    expect(task.status).toBe("InProgress");
    expect(task.type).toBe("Bug");
    expect(task.severity).toBe("High");
    // The QUBIT key space stays untouched — commit automation parses "<code>-<n>".
    expect(task.taskKey).toBeNull();
  });

  it("is idempotent: re-syncing the same issue writes nothing and audits nothing", async () => {
    respond([issue()]);
    const before = await withTenant(ctx, (tx) =>
      tx.auditLog.count({ where: { entityType: "project_task" } }),
    );
    const r = await syncProject(ctx, projectId);
    expect(r.created).toBe(0);
    expect(r.updated).toBe(0);
    expect(r.unchanged).toBe(1);
    const after = await withTenant(ctx, (tx) =>
      tx.auditLog.count({ where: { entityType: "project_task" } }),
    );
    expect(after).toBe(before);
  });

  it("updates only what moved, and audits the change with before/after", async () => {
    respond([issue({ state: "Fixed" })]);
    const r = await syncProject(ctx, projectId);
    expect(r.updated).toBe(1);

    const [task] = await listProjectTasks(ctx, projectId);
    expect(task.status).toBe("Completed");

    const entry = await withTenant(ctx, (tx) =>
      tx.auditLog.findFirst({
        where: { entityType: "project_task", entityId: task.id, action: "update" },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(entry?.before).toMatchObject({ status: "InProgress" });
    expect(entry?.after).toMatchObject({ status: "Completed" });
  });

  it("mirrored tasks count toward project progress — the whole point of mirroring", async () => {
    const progress = await getProjectProgress(ctx, projectId);
    expect(progress.total).toBe(1);
    expect(progress.completed).toBe(1);
    expect(progress.pct).toBe(100);
  });

  it("matches an assignee by email, and reports the ones it could not match", async () => {
    respond([
      issue({ state: "In Progress", assigneeEmail: devEmail }),
      issue({ id: "2-2", idReadable: "RBC-2", assigneeEmail: "nobody_here@example.invalid" }),
    ]);
    const r = await syncProject(ctx, projectId);
    expect(r.unmatchedAssignees).toEqual(["Mapped Person"]);

    const tasks = await listProjectTasks(ctx, projectId);
    const matched = tasks.find((t) => t.externalKey === "RBC-1")!;
    const unmatched = tasks.find((t) => t.externalKey === "RBC-2")!;
    expect(matched.assigneeId).toBe(devId);
    expect(matched.externalAssigneeName).toBeNull(); // never both
    expect(unmatched.assigneeId).toBeNull();
    expect(unmatched.externalAssigneeName).toBe("Mapped Person");
  });

  it("never matches an assignee whose account lives in another tenant", async () => {
    // A real Riverbank user, offered to a KCB project's sync. RLS must make them invisible.
    const [outsider] = await createUsers(riverbankId, 1, "ytx");
    const outsiderEmail = await withTenant({ tenantId: riverbankId, userId: "test" }, async (tx) =>
      (await tx.user.findUniqueOrThrow({ where: { id: outsider.id }, select: { email: true } })).email,
    );

    respond([issue({ id: "2-9", idReadable: "RBC-9", assigneeEmail: outsiderEmail })]);
    await syncProject(ctx, projectId);

    const task = (await listProjectTasks(ctx, projectId)).find((t) => t.externalKey === "RBC-9")!;
    expect(task.assigneeId).toBeNull();
    expect(task.externalAssigneeName).toBe("Mapped Person");
    await cleanupFixtureUsers(riverbankId);
  });

  it("RLS: a mirrored task is invisible from the other tenant", async () => {
    const seen = await withTenant({ tenantId: riverbankId, userId: "test" }, (tx) =>
      tx.projectTask.count({ where: { sourceSystem: "youtrack", externalKey: "RBC-1" } }),
    );
    expect(seen).toBe(0);
  });

  it("refuses a local edit to a field YouTrack owns, naming where to make it", async () => {
    const task = (await listProjectTasks(ctx, projectId)).find((t) => t.externalKey === "RBC-1")!;
    await expect(updateTask(ctx, task.id, { status: "NotStarted" })).rejects.toThrow(/RBC-1 in YouTrack/);
    await expect(updateTask(ctx, task.id, { assigneeId: null })).rejects.toThrow(TaskError);
    // …and the row is genuinely unchanged.
    const after = (await listProjectTasks(ctx, projectId)).find((t) => t.externalKey === "RBC-1")!;
    expect(after.status).toBe("InProgress");
  });

  it("refuses deleting a mirrored task — the next sync would bring it back", async () => {
    const task = (await listProjectTasks(ctx, projectId)).find((t) => t.externalKey === "RBC-1")!;
    await expect(removeTask(ctx, task.id)).rejects.toThrow(/mirrored from YouTrack/);
  });

  it("refuses new native tasks on a connected project", async () => {
    await expect(addTasks(ctx, projectId, [{ title: "Typed straight into QUBIT" }])).rejects.toThrow(
      /tracked in YouTrack/,
    );
  });

  it("records a failure on the integration row without advancing the watermark", async () => {
    const before = await withTenant(ctx, (tx) =>
      tx.projectIntegration.findUniqueOrThrow({
        where: { projectId_provider: { projectId, provider: "youtrack" } },
        select: { lastSyncAt: true },
      }),
    );
    const { YoutrackError } = await import("@/server/connectors/youtrack");
    fetchIssues.mockRejectedValue(new YoutrackError("YouTrack rejected the token.", "AUTH"));

    await expect(syncProject(ctx, projectId)).rejects.toThrow(SyncError);
    const after = await withTenant(ctx, (tx) =>
      tx.projectIntegration.findUniqueOrThrow({
        where: { projectId_provider: { projectId, provider: "youtrack" } },
        select: { lastSyncAt: true, lastSyncError: true },
      }),
    );
    expect(after.lastSyncError).toContain("rejected the token");
    // A failed run must re-read the same window next time, not skip past it.
    expect(after.lastSyncAt?.getTime()).toBe(before.lastSyncAt?.getTime());
  });

  it("clears the stored error on the next success", async () => {
    respond([issue()]);
    await syncProject(ctx, projectId);
    const row = await withTenant(ctx, (tx) =>
      tx.projectIntegration.findUniqueOrThrow({
        where: { projectId_provider: { projectId, provider: "youtrack" } },
        select: { lastSyncError: true, lastSyncAt: true },
      }),
    );
    expect(row.lastSyncError).toBeNull();
    expect(row.lastSyncAt).not.toBeNull();
  });

  it("refuses to sync a project that is not connected", async () => {
    const other = await withTenant(ctx, (tx) =>
      tx.project.create({
        data: {
          tenantId: kcbId, code: `YN${Date.now() % 100000}`, name: "Not connected",
          type: "Project", priority: "Low", status: "OnTrack", leadUserId: leadId,
        },
        select: { id: true },
      }),
    );
    await expect(syncProject(ctx, other.id)).rejects.toThrow(/not connected/);
    await withTenant(ctx, (tx) => tx.project.deleteMany({ where: { id: other.id } }));
  });

  it("surfaces truncation rather than pretending the sync was complete", async () => {
    respond([issue()], true);
    const r = await syncProject(ctx, projectId);
    expect(r.truncated).toBe(true);
  });
});
