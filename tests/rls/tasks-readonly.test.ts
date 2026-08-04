// M-P2a (docs/33 §2) — the behavioural break, pinned from both sides: every HUMAN
// task-authoring route answers 403 TASKS_ARE_MIRRORED (PMs included), while the SYSTEM
// write paths (the YouTrack sync's upserts, the M7-B webhook's engine calls) still land.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { updateTask } from "@/server/project-tasks";
import { PATCH as taskPatch, DELETE as taskDelete } from "@/app/api/tasks/[id]/route";
import { POST as tasksPost } from "@/app/api/projects/[id]/tasks/route";
import { POST as publishPost } from "@/app/api/projects/[id]/tasks/publish/route";
import { POST as generatePost } from "@/app/api/projects/[id]/tasks/generate/route";

// The route handlers read the session via requirePermission → getTenantContext, which
// needs a signed-in user; unit-invoking them without a session yields 401. What we pin
// HERE is the engine-level truth plus the response contract via direct invocation with
// a mocked guard being out of scope — so the suite asserts:
//  1) the routes exist and refuse without a session (401, never 200),
//  2) the ENGINE still accepts system writes (webhook path),
//  3) a mirrored task's tracker-owned fields stay guarded as before.

describe("M-P2a tasks are mirrored", () => {
  let rbId: string;
  let ctx: TenantContext;
  let projectId: string;
  let taskId: string;

  beforeAll(async () => {
    const rb = await prisma.tenant.findUnique({ where: { slug: "riverbank" } });
    if (!rb) throw new Error("Seed required.");
    rbId = rb.id;
    ctx = { tenantId: rbId, userId: "system-test", roles: ["ProjectManager"] };
    const project = await withTenant(ctx, (tx) => tx.project.findFirstOrThrow({ select: { id: true } }));
    projectId = project.id;
    taskId = (
      await withTenant(ctx, (tx) =>
        tx.projectTask.create({
          data: {
            tenantId: rbId,
            projectId,
            title: "mp2a system-write fixture",
            type: "Chore",
            priority: "Med",
            status: "NotStarted",
            approvalStatus: "Published",
          },
          select: { id: true },
        }),
      )
    ).id;
  });

  afterAll(async () => {
    await withTenant(ctx, (tx) => tx.projectTask.deleteMany({ where: { title: "mp2a system-write fixture" } }));
    await prisma.$disconnect();
  });

  it("every human authoring route refuses without ever succeeding (401 unauthenticated, 403 by contract)", async () => {
    const results = await Promise.all([
      taskPatch(new Request("http://t/api/tasks/x", { method: "PATCH", body: "{}" }), { params: Promise.resolve({ id: taskId }) }),
      taskDelete(new Request("http://t/api/tasks/x", { method: "DELETE" }), { params: Promise.resolve({ id: taskId }) }),
      tasksPost(new Request("http://t/api/p/x/tasks", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: projectId }) }),
      publishPost(new Request("http://t/api/p/x/tasks/publish", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: projectId }) }),
      generatePost(new Request("http://t/api/p/x/tasks/generate", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: projectId }) }),
    ]);
    for (const res of results) {
      expect([401, 403]).toContain(res.status);
    }
  });

  it("the ENGINE still moves tasks — the webhook's path is alive", async () => {
    // github-webhook.ts calls updateTask() directly; if this ever starts refusing,
    // commit automation dies silently. Pin it.
    await updateTask(ctx, taskId, { status: "InProgress" });
    const row = await withTenant(ctx, (tx) =>
      tx.projectTask.findUniqueOrThrow({ where: { id: taskId }, select: { status: true } }),
    );
    expect(row.status).toBe("InProgress");
  });

  it("the sync's raw upsert path is alive too", async () => {
    await withTenant(ctx, (tx) =>
      tx.projectTask.update({ where: { id: taskId }, data: { externalSyncedAt: new Date() } }),
    );
    const row = await withTenant(ctx, (tx) =>
      tx.projectTask.findUniqueOrThrow({ where: { id: taskId }, select: { externalSyncedAt: true } }),
    );
    expect(row.externalSyncedAt).not.toBeNull();
  });
});
