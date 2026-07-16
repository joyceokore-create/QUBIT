import { z } from "zod";
import { cuid, editorJson } from "@/server/schemas/common";

/** Checklist + comment request schemas (04-module-specs §2). All `.strict()`. */

export const createChecklist = z.object({ name: z.string().min(1).max(200) }).strict();
export const updateChecklist = z.object({ name: z.string().min(1).max(200) }).strict();

export const addChecklistItem = z
  .object({ name: z.string().min(1).max(500), assigneeId: cuid.optional() })
  .strict();

export const updateChecklistItem = z
  .object({
    name: z.string().min(1).max(500).optional(),
    done: z.boolean().optional(),
    assigneeId: cuid.nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update." });

export const addComment = z
  .object({
    content: editorJson,
    parentId: cuid.optional(),
    assignedToId: cuid.optional(),
  })
  .strict();

export const editComment = z.object({ content: editorJson }).strict();
export const resolveComment = z.object({ resolved: z.boolean() }).strict();
export const reactComment = z.object({ emoji: z.string().min(1).max(16) }).strict();
