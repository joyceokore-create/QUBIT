// Phase 3 — time tracking: one-running rule, duration, report, isolation.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createSpace, createList } from "@/server/spaces";
import { createTask } from "@/server/tasks";
import {
  startTimer,
  stopTimer,
  addManualEntry,
  getRunningTimer,
  listTaskEntries,
  timeReport,
} from "@/server/time";
import { ConflictError, NotFoundError } from "@/server/errors";

describe("Phase 3 — time tracking", () => {
  let kcb: TenantContext;
  let riverbank: TenantContext;
  let taskId: string;
  let taskId2: string;
  const createdSpaceIds: string[] = [];

  beforeAll(async () => {
    const [k, r] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!k || !r) throw new Error("Seed required.");
    const [ku, ru] = await Promise.all([
      withTenant({ tenantId: k.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } })),
      withTenant({ tenantId: r.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } })),
    ]);
    kcb = { tenantId: k.id, userId: ku.id, roles: [] };
    riverbank = { tenantId: r.id, userId: ru.id, roles: [] };
    const space = await createSpace(kcb, { name: "QA Time", statusTemplate: "simple" });
    createdSpaceIds.push(space.id);
    const list = await createList(kcb, { spaceId: space.id, name: "Time list" });
    taskId = (await createTask(kcb, { listId: list.id, name: "Timed task" })).id;
    taskId2 = (await createTask(kcb, { listId: list.id, name: "Other task" })).id;
  });

  afterAll(async () => {
    for (const id of createdSpaceIds) {
      await withTenant({ tenantId: kcb.tenantId, userId: "seed" }, (tx) =>
        tx.space.deleteMany({ where: { id } }),
      );
    }
    await prisma.$disconnect();
  });

  it("enforces one running timer per user (concurrent start rejected)", async () => {
    await startTimer(kcb, taskId);
    const running = await getRunningTimer(kcb);
    expect(running?.taskId).toBe(taskId);
    await expect(startTimer(kcb, taskId2)).rejects.toBeInstanceOf(ConflictError);
    // Stop clears the running timer.
    const stopped = await stopTimer(kcb);
    expect(stopped.end).not.toBeNull();
    expect(await getRunningTimer(kcb)).toBeNull();
  });

  it("computes duration on stop and rejects stop with no running timer", async () => {
    await startTimer(kcb, taskId);
    const stopped = await stopTimer(kcb);
    expect(stopped.durationMin).toBeGreaterThanOrEqual(0);
    await expect(stopTimer(kcb)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("sums manual entries in the task total and the report", async () => {
    await addManualEntry(kcb, taskId, { durationMin: 30, start: new Date("2026-07-06T09:00:00Z") });
    await addManualEntry(kcb, taskId, { durationMin: 45, start: new Date("2026-07-06T11:00:00Z"), billable: true });

    const { totalMin } = await listTaskEntries(kcb, taskId);
    expect(totalMin).toBeGreaterThanOrEqual(75);

    const report = await timeReport(kcb, {
      from: new Date("2026-07-06T00:00:00Z"),
      to: new Date("2026-07-07T00:00:00Z"),
      userId: kcb.userId,
    });
    const row = report.rows.find((r) => r.taskId === taskId);
    expect(row?.totalMin).toBe(75);
    expect(row?.billableMin).toBe(45);
    expect(report.totalMin).toBe(75);
  });

  it("cannot start a timer on another tenant's task (cross-tenant → NotFound)", async () => {
    await expect(startTimer(riverbank, taskId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
