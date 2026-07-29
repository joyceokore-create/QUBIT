// Phase 6.1 (docs/15, DM1.15) — task taxonomy, key allocation, blocked-as-flag.
// Needs a seeded DB (both tenants).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import {
  addTasks,
  listProjectTasks,
  getProjectProgress,
  publishProjectDrafts,
  updateTask,
  flagTaskBlocked,
  unflagTaskBlocked,
  UpdateTaskInput,
} from "@/server/project-tasks";
import { createProject, projectCodeBase } from "@/server/projects";

describe("Phase 6.1 — task keys, taxonomy, blocked flag", () => {
  let kcb: TenantContext;
  let riverbank: TenantContext;
  let projectId: string;
  const CODE = `KEYS-${Date.now().toString().slice(-6)}`;

  beforeAll(async () => {
    const [k, r] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!k || !r) throw new Error("task-taxonomy tests require seeded data — run `pnpm prisma db seed` first.");
    const kUser = await withTenant({ tenantId: k.id, userId: "seed" }, (tx) =>
      tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }),
    );
    kcb = { tenantId: k.id, userId: kUser.id, roles: ["ProjectManager"] };
    riverbank = { tenantId: r.id, userId: "rb-actor", roles: ["ProjectManager"] };
    await withTenant(kcb, async (tx) => {
      const p = await tx.project.create({
        data: { tenantId: k.id, code: CODE, name: "Key allocation test", type: "Project", priority: "Med", status: "OnTrack" },
      });
      projectId = p.id;
    });
  });

  afterAll(async () => {
    await withTenant(kcb, async (tx) => {
      await tx.blocker.deleteMany({ where: { projectId } });
      await tx.projectTask.deleteMany({ where: { projectId } });
      await tx.projectTaskCounter.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await prisma.$disconnect();
  });

  it("assigns sequential keys to published tasks; drafts get none until approved", async () => {
    await addTasks(kcb, projectId, [{ title: "First" }, { title: "Second", type: "Bug", severity: "High" }]);
    let tasks = await listProjectTasks(kcb, projectId);
    expect(tasks.map((t) => t.taskKey).sort()).toEqual([`${CODE}-1`, `${CODE}-2`]);
    expect(tasks.find((t) => t.title === "Second")?.type).toBe("Bug");

    await addTasks(kcb, projectId, [{ title: "AI draft" }], { approvalStatus: "Draft" });
    tasks = await listProjectTasks(kcb, projectId);
    expect(tasks.find((t) => t.title === "AI draft")?.taskKey).toBeNull();

    await publishProjectDrafts(kcb, projectId);
    tasks = await listProjectTasks(kcb, projectId);
    expect(tasks.find((t) => t.title === "AI draft")?.taskKey).toBe(`${CODE}-3`);
  });

  it("keeps keys unique under concurrent adds (counter row serializes claims)", async () => {
    await Promise.all([
      addTasks(kcb, projectId, [{ title: "C1" }, { title: "C2" }]),
      addTasks(kcb, projectId, [{ title: "C3" }]),
      addTasks(kcb, projectId, [{ title: "C4" }, { title: "C5" }]),
    ]);
    const tasks = await listProjectTasks(kcb, projectId);
    const keys = tasks.map((t) => t.taskKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length); // no duplicates
    expect(keys).toHaveLength(8); // 3 from the previous test + 5 concurrent
  });

  it("publishes a single draft via updateTask and claims its key", async () => {
    await addTasks(kcb, projectId, [{ title: "Solo draft" }], { approvalStatus: "Draft" });
    const draft = (await listProjectTasks(kcb, projectId)).find((t) => t.title === "Solo draft")!;
    expect(draft.taskKey).toBeNull();
    await updateTask(kcb, draft.id, { approvalStatus: "Published" });
    const published = (await listProjectTasks(kcb, projectId)).find((t) => t.title === "Solo draft")!;
    expect(published.taskKey).toBe(`${CODE}-9`);
  });

  it("flags a task blocked via a linked Open blocker, and unflags by resolving it", async () => {
    const task = (await listProjectTasks(kcb, projectId)).find((t) => t.title === "First")!;
    expect(task.blocked).toBe(false);

    await flagTaskBlocked(kcb, task.id, { description: "Waiting on vendor" });
    let after = (await listProjectTasks(kcb, projectId)).find((t) => t.id === task.id)!;
    expect(after.blocked).toBe(true);
    expect(after.openBlockerId).toBeTruthy();
    expect(after.status).toBe(task.status); // blocked is a flag — the column doesn't change

    const progress = await getProjectProgress(kcb, projectId);
    expect(progress.blocked).toBe(1);

    await unflagTaskBlocked(kcb, task.id);
    after = (await listProjectTasks(kcb, projectId)).find((t) => t.id === task.id)!;
    expect(after.blocked).toBe(false);
    expect((await getProjectProgress(kcb, projectId)).blocked).toBe(0);
  });

  it("rejects the retired 'Blocked' status and accepts the new QA statuses", () => {
    expect(UpdateTaskInput.safeParse({ status: "Blocked" }).success).toBe(false);
    expect(UpdateTaskInput.safeParse({ status: "InReview" }).success).toBe(true);
    expect(UpdateTaskInput.safeParse({ status: "InQA" }).success).toBe(true);
    expect(UpdateTaskInput.safeParse({ type: "Bug", severity: "Critical" }).success).toBe(true);
    expect(UpdateTaskInput.safeParse({ type: "Epic" }).success).toBe(false);
  });

  it("creates a task assigned to a member and placed in a column in one step (per Joyce)", async () => {
    await addTasks(kcb, projectId, [
      { title: "Assigned bug", type: "Bug", severity: "High", status: "InQA", assigneeId: kcb.userId },
    ]);
    const t = (await listProjectTasks(kcb, projectId)).find((x) => x.title === "Assigned bug")!;
    expect(t.assigneeId).toBe(kcb.userId);
    expect(t.status).toBe("InQA");
    expect(t.type).toBe("Bug");
    await expect(
      addTasks(kcb, projectId, [{ title: "Ghost assignee", assigneeId: "00000000-0000-4000-8000-000000000000" }]),
    ).rejects.toThrow(/Assignee not found/);
  });

  it("creating a project with a lead enrols them as a Project Manager member (per Joyce)", async () => {
    const p = await createProject(kcb, {
      code: `LEAD-${Date.now().toString().slice(-6)}`,
      name: "Lead enrolment test",
      type: "Project",
      priority: "Med",
      status: "Planning",
      leadUserId: kcb.userId,
    });
    try {
      const member = await withTenant(kcb, (tx) =>
        tx.projectMember.findFirst({ where: { projectId: p.id, userId: kcb.userId }, select: { role: true } }),
      );
      expect(member?.role).toBe("Project Manager");
    } finally {
      await withTenant(kcb, async (tx) => {
        await tx.projectMember.deleteMany({ where: { projectId: p.id } });
        await tx.projectTaskCounter.deleteMany({ where: { projectId: p.id } });
        await tx.project.deleteMany({ where: { id: p.id } });
      });
    }
  });

  it("auto-generates unique project codes from the name (DM1.21)", async () => {
    // Pure base derivation.
    expect(projectCodeBase("Asset Valuation System")).toBe("AVS");
    expect(projectCodeBase("HomeQuest")).toBe("HOM");
    expect(projectCodeBase("Zed Uno")).toBe("ZU");
    expect(projectCodeBase("x")).toBe("XPR"); // too short → padded

    // Same name twice → base, then suffixed; task keys use the generated code.
    const mk = (name: string) =>
      createProject(kcb, { name, type: "Project", priority: "Med", status: "Planning", leadUserId: kcb.userId });
    const a = await mk("Quantum Ledger Fixture");
    const b = await mk("Quantum Ledger Fixture");
    try {
      expect(a.code).toBe("QLF");
      expect(b.code).toBe("QLF2");
      await addTasks(kcb, b.id, [{ title: "First task" }]);
      const [t] = await listProjectTasks(kcb, b.id);
      expect(t.taskKey).toBe("QLF2-1");
    } finally {
      await withTenant(kcb, async (tx) => {
        const ids = [a.id, b.id];
        await tx.projectTask.deleteMany({ where: { projectId: { in: ids } } });
        await tx.projectTaskCounter.deleteMany({ where: { projectId: { in: ids } } });
        await tx.projectMember.deleteMany({ where: { projectId: { in: ids } } });
        await tx.project.deleteMany({ where: { id: { in: ids } } });
      });
    }
  });

  it("RLS: tenant B cannot see tenant A's task counter or keyed tasks", async () => {
    const foreignCounters = await withTenant(riverbank, (tx) =>
      tx.projectTaskCounter.findMany({ where: { projectId } }),
    );
    expect(foreignCounters).toHaveLength(0);
    const foreignTasks = await withTenant(riverbank, (tx) =>
      tx.projectTask.findMany({ where: { projectId } }),
    );
    expect(foreignTasks).toHaveLength(0);
  });
});
