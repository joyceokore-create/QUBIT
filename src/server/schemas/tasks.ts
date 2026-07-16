import { z } from "zod";
import { cuid, editorJson } from "@/server/schemas/common";

/**
 * Task request schemas (05-api-spec.md §Tasks). `.strict()` rejects unknown keys.
 * Editor content is opaque JSON here; deep validation lands with the editor package.
 */

const priority = z.enum(["URGENT", "HIGH", "NORMAL", "LOW"]);

export const createTask = z
  .object({
    name: z.string().min(1).max(1024),
    statusId: cuid.optional(),
    priority: priority.optional(),
    parentId: cuid.optional(),
    startDate: z.coerce.date().optional(),
    dueDate: z.coerce.date().optional(),
    isMilestone: z.boolean().optional(),
    timeEstimate: z.number().int().min(0).optional(),
    assigneeIds: z.array(cuid).max(50).optional(),
    tagIds: z.array(cuid).max(50).optional(),
  })
  .strict();

export const updateTask = z
  .object({
    name: z.string().min(1).max(1024).optional(),
    statusId: cuid.optional(),
    priority: priority.nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    isMilestone: z.boolean().optional(),
    timeEstimate: z.number().int().min(0).nullable().optional(),
    description: editorJson.optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update." });

export const moveTask = z.object({ listId: cuid }).strict();

export const createSubtask = z
  .object({
    name: z.string().min(1).max(1024),
    statusId: cuid.optional(),
    priority: priority.optional(),
    assigneeIds: z.array(cuid).max(50).optional(),
  })
  .strict();

export const addDependency = z
  .object({ toId: cuid, type: z.enum(["BLOCKS", "WAITING_ON", "LINKED"]) })
  .strict();

export const setParent = z.object({ parentId: cuid.nullable() }).strict();

export type CreateTaskInput = z.infer<typeof createTask>;
export type UpdateTaskInput = z.infer<typeof updateTask>;
