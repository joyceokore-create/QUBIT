// Phase 1 Increment 6 — custom fields: validation, inheritance, formula, isolation.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createSpace, createFolder, createList } from "@/server/spaces";
import { createTask } from "@/server/tasks";
import { createChecklist, addChecklistItem, updateChecklistItem } from "@/server/checklists";
import {
  createFieldDefinition,
  setFieldValue,
  getTaskFields,
} from "@/server/fields";
import { NotFoundError, UnprocessableError } from "@/server/errors";

describe("Phase 1 — custom fields", () => {
  let kcb: TenantContext;
  let riverbank: TenantContext;
  let spaceId: string;
  let listId: string;
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
    const space = await createSpace(kcb, { name: "QA Fields", statusTemplate: "simple" });
    createdSpaceIds.push(space.id);
    spaceId = space.id;
    const list = await createList(kcb, { spaceId, name: "Fields list" });
    listId = list.id;
    taskId = (await createTask(kcb, { listId, name: "Fields task" })).id;
  });

  afterAll(async () => {
    for (const id of createdSpaceIds) {
      await withTenant({ tenantId: kcb.tenantId, userId: "seed" }, (tx) =>
        tx.space.deleteMany({ where: { id } }),
      );
    }
    await prisma.$disconnect();
  });

  it("validates values per type and rejects bad input", async () => {
    const num = await createFieldDefinition(kcb, { locationType: "LIST", locationId: listId, name: "Story points", type: "NUMBER" });
    await setFieldValue(kcb, taskId, num.id, 8);
    await expect(setFieldValue(kcb, taskId, num.id, "not a number")).rejects.toBeInstanceOf(UnprocessableError);

    const url = await createFieldDefinition(kcb, { locationType: "LIST", locationId: listId, name: "Spec", type: "URL" });
    await expect(setFieldValue(kcb, taskId, url.id, "notaurl")).rejects.toBeInstanceOf(UnprocessableError);
    await setFieldValue(kcb, taskId, url.id, "https://example.invalid/spec");
  });

  it("rejects a dropdown value outside its options", async () => {
    const dd = await createFieldDefinition(kcb, {
      locationType: "LIST",
      locationId: listId,
      name: "T-shirt",
      type: "DROPDOWN",
      config: { options: [{ id: "s", label: "S" }, { id: "m", label: "M" }] },
    });
    await setFieldValue(kcb, taskId, dd.id, "m");
    await expect(setFieldValue(kcb, taskId, dd.id, "xl")).rejects.toBeInstanceOf(UnprocessableError);
  });

  it("inherits space & folder fields down to a task in a nested list", async () => {
    const spaceField = await createFieldDefinition(kcb, { locationType: "SPACE", locationId: spaceId, name: "Budget", type: "MONEY" });
    const folder = await createFolder(kcb, { spaceId, name: "F" });
    const folderField = await createFieldDefinition(kcb, { locationType: "FOLDER", locationId: folder.id, name: "Region", type: "TEXT" });
    const nested = await createList(kcb, { spaceId, folderId: folder.id, name: "Nested" });
    const nestedTask = await createTask(kcb, { listId: nested.id, name: "Nested task" });

    const fields = await getTaskFields(kcb, nestedTask.id);
    const names = fields.map((f) => f.name);
    expect(names).toContain("Budget"); // from space
    expect(names).toContain("Region"); // from folder
    expect(spaceField.id).toBeTruthy();
    expect(folderField.id).toBeTruthy();
  });

  it("computes a FORMULA field from other numeric fields", async () => {
    const list = await createList(kcb, { spaceId, name: "Formula list" });
    const task = await createTask(kcb, { listId: list.id, name: "Formula task" });
    const budget = await createFieldDefinition(kcb, { locationType: "LIST", locationId: list.id, name: "Budget", type: "NUMBER" });
    await createFieldDefinition(kcb, {
      locationType: "LIST",
      locationId: list.id,
      name: "With buffer",
      type: "FORMULA",
      config: { formula: "{Budget} * 1.1" },
    });
    await setFieldValue(kcb, task.id, budget.id, 1000);

    const fields = await getTaskFields(kcb, task.id);
    const formula = fields.find((f) => f.name === "With buffer");
    expect(formula?.computed).toBe(true);
    expect(formula?.value).toBeCloseTo(1100);
  });

  it("rejects setting a computed (FORMULA) field directly", async () => {
    const list = await createList(kcb, { spaceId, name: "RO list" });
    const task = await createTask(kcb, { listId: list.id, name: "RO task" });
    const f = await createFieldDefinition(kcb, {
      locationType: "LIST",
      locationId: list.id,
      name: "Calc",
      type: "FORMULA",
      config: { formula: "1 + 1" },
    });
    await expect(setFieldValue(kcb, task.id, f.id, 5)).rejects.toBeInstanceOf(UnprocessableError);
  });

  it("computes PROGRESS_AUTO from checklist completion", async () => {
    const list = await createList(kcb, { spaceId, name: "Prog list" });
    const task = await createTask(kcb, { listId: list.id, name: "Prog task" });
    await createFieldDefinition(kcb, { locationType: "LIST", locationId: list.id, name: "Done %", type: "PROGRESS_AUTO" });
    const cl = await createChecklist(kcb, task.id, "steps");
    const a = await addChecklistItem(kcb, cl.id, { name: "one" });
    await addChecklistItem(kcb, cl.id, { name: "two" });
    await updateChecklistItem(kcb, a.id, { done: true });

    const fields = await getTaskFields(kcb, task.id);
    expect(fields.find((f) => f.name === "Done %")?.value).toBe(50);
  });

  it("cannot read another tenant's task fields (cross-tenant → NotFound)", async () => {
    await expect(getTaskFields(riverbank, taskId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
