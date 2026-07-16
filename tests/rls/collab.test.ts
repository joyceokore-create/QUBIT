// Phase 1 Increment 4 — checklists + threaded comments.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createSpace, createList } from "@/server/spaces";
import { createTask } from "@/server/tasks";
import {
  createChecklist,
  addChecklistItem,
  updateChecklistItem,
  listChecklists,
} from "@/server/checklists";
import {
  addComment,
  listComments,
  setResolved,
  toggleReaction,
  deleteComment,
} from "@/server/comments";
import { NotFoundError, UnprocessableError } from "@/server/errors";

describe("Phase 1 — checklists & comments", () => {
  let kcb: TenantContext;
  let riverbank: TenantContext;
  let taskId: string;
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
    const space = await createSpace(kcb, { name: "QA Collab", statusTemplate: "simple" });
    createdSpaceIds.push(space.id);
    const list = await createList(kcb, { spaceId: space.id, name: "Collab list" });
    taskId = (await createTask(kcb, { listId: list.id, name: "Collab task" })).id;
  });

  afterAll(async () => {
    for (const id of createdSpaceIds) {
      await withTenant({ tenantId: kcb.tenantId, userId: "seed" }, (tx) =>
        tx.space.deleteMany({ where: { id } }),
      );
    }
    await prisma.$disconnect();
  });

  it("tracks checklist progress as items are checked", async () => {
    const cl = await createChecklist(kcb, taskId, "Launch steps");
    const a = await addChecklistItem(kcb, cl.id, { name: "Draft" });
    await addChecklistItem(kcb, cl.id, { name: "Review" });

    let [loaded] = await listChecklists(kcb, taskId);
    expect(loaded.items).toHaveLength(2);
    expect(loaded.items.filter((i) => i.done)).toHaveLength(0);

    await updateChecklistItem(kcb, a.id, { done: true });
    [loaded] = await listChecklists(kcb, taskId);
    expect(loaded.items.filter((i) => i.done)).toHaveLength(1);
  });

  it("threads replies one level and rejects deeper nesting", async () => {
    const top = await addComment(kcb, taskId, { content: { text: "Top-level" } });
    const reply = await addComment(kcb, taskId, { content: { text: "A reply" }, parentId: top.id });
    // Replying to a reply is rejected.
    await expect(
      addComment(kcb, taskId, { content: { text: "nested" }, parentId: reply.id }),
    ).rejects.toBeInstanceOf(UnprocessableError);

    const comments = await listComments(kcb, taskId);
    const topNode = comments.find((c) => c.id === top.id);
    expect(topNode?.replies.map((r) => r.id)).toContain(reply.id);
  });

  it("resolves an assigned comment", async () => {
    const c = await addComment(kcb, taskId, { content: { text: "Please action" }, assignedToId: kcb.userId });
    expect(c.assignedToId).toBe(kcb.userId);
    const resolved = await setResolved(kcb, c.id, true);
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it("toggles a reaction on and off for the same user", async () => {
    const c = await addComment(kcb, taskId, { content: { text: "React to me" } });
    const on = await toggleReaction(kcb, c.id, "👍");
    expect((on.reactions as Record<string, string[]>)["👍"]).toContain(kcb.userId);
    const off = await toggleReaction(kcb, c.id, "👍");
    expect((off.reactions as Record<string, string[]>)["👍"]).toBeUndefined();
  });

  it("soft-deletes a comment (hidden from the thread)", async () => {
    const c = await addComment(kcb, taskId, { content: { text: "delete me" } });
    await deleteComment(kcb, c.id);
    const comments = await listComments(kcb, taskId);
    expect(comments.find((x) => x.id === c.id)).toBeUndefined();
  });

  it("cannot read another tenant's checklists (cross-tenant → NotFound)", async () => {
    await expect(listChecklists(riverbank, taskId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
