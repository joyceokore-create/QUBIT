import { z } from "zod";
import { cuid } from "@/server/schemas/common";

/**
 * Hierarchy request schemas (docs/clickup-transformation/05-api-spec.md §Hierarchy).
 * Phase 0 ships the schema library + read endpoint; the write handlers that consume
 * the create/reorder schemas land in Phase 1, but the contracts live here now.
 */

export const createSpace = z
  .object({
    name: z.string().min(1).max(120),
    icon: z.string().max(64).optional(),
    color: z.string().max(64).optional(), // token key, not raw hex
    isPrivate: z.boolean().default(false),
    settings: z.record(z.unknown()).default({}),
    statusTemplate: z.enum(["simple", "kanban", "scrum", "ppm"]).optional(),
  })
  .strict();

export const updateSpace = z
  .object({
    name: z.string().min(1).max(120).optional(),
    icon: z.string().max(64).nullable().optional(),
    color: z.string().max(64).nullable().optional(),
    isPrivate: z.boolean().optional(),
    settings: z.record(z.unknown()).optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update." });

export const updateFolder = z
  .object({ name: z.string().min(1).max(120).optional(), archived: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update." });

export const updateList = z
  .object({
    name: z.string().min(1).max(120).optional(),
    archived: z.boolean().optional(),
    statusGroupId: cuid.nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    priority: z.number().int().min(1).max(4).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update." });

export const createFolder = z
  .object({
    name: z.string().min(1).max(120),
    parentId: cuid.optional(),
  })
  .strict();

export const createList = z
  .object({
    name: z.string().min(1).max(120),
    folderId: cuid.optional(),
    statusGroupId: cuid.optional(),
    startDate: z.coerce.date().optional(),
    dueDate: z.coerce.date().optional(),
    priority: z.number().int().min(1).max(4).optional(),
  })
  .strict();

export const reorder = z
  .object({
    objectType: z.enum(["SPACE", "FOLDER", "LIST"]),
    objectId: cuid,
    afterId: cuid.optional(), // null/absent = move to start
  })
  .strict();

export type CreateSpaceInput = z.infer<typeof createSpace>;
export type CreateFolderInput = z.infer<typeof createFolder>;
export type CreateListInput = z.infer<typeof createList>;
export type ReorderInput = z.infer<typeof reorder>;
