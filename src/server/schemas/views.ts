import { z } from "zod";
import { cuid } from "@/server/schemas/common";

/** View + task-query request schemas (05-api-spec.md §Views / Tasks). */

const priority = z.enum(["URGENT", "HIGH", "NORMAL", "LOW"]);

export const taskQuery = z
  .object({
    filters: z
      .object({
        statusIds: z.array(cuid).optional(),
        priorities: z.array(priority).optional(),
        assigneeIds: z.array(z.string()).optional(),
        tagIds: z.array(cuid).optional(),
        search: z.string().max(200).optional(),
        due: z.enum(["overdue", "today", "week", "none", "any"]).optional(),
      })
      .strict()
      .optional(),
    sort: z
      .object({
        field: z.enum(["orderIndex", "dueDate", "priority", "name", "createdAt"]),
        dir: z.enum(["asc", "desc"]),
      })
      .strict()
      .optional(),
    cursor: cuid.optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const viewType = z.enum([
  "LIST",
  "BOARD",
  "CALENDAR",
  "GANTT",
  "TABLE",
  "TIMELINE",
  "WORKLOAD",
  "MINDMAP",
]);

export const createView = z
  .object({
    type: viewType,
    name: z.string().min(1).max(120),
    config: z.record(z.unknown()).optional(),
    isPinned: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const updateView = z
  .object({
    name: z.string().min(1).max(120).optional(),
    type: viewType.optional(),
    config: z.record(z.unknown()).optional(),
    isPinned: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update." });
