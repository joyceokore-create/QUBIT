import { z } from "zod";
import { cuid } from "@/server/schemas/common";

/** Automation request schemas (05-api-spec.md §Automations). */

const trigger = z
  .object({
    type: z.enum(["task.status_changed", "task.created"]),
    params: z.object({ to: z.array(cuid).optional() }).strict().optional(),
  })
  .strict();

const condition = z
  .object({
    field: z.enum(["priority", "statusId", "assignee"]),
    op: z.enum(["eq", "neq", "is_set", "not_set"]),
    value: z.string().optional(),
  })
  .strict();

const action = z
  .object({
    type: z.enum(["task.set_status", "task.set_priority", "task.set_assignee", "task.add_comment"]),
    params: z.record(z.string()),
  })
  .strict();

export const createAutomation = z
  .object({
    name: z.string().min(1).max(160),
    trigger,
    conditions: z.array(condition).max(20).optional(),
    actions: z.array(action).min(1).max(20),
    active: z.boolean().optional(),
  })
  .strict();

export const updateAutomation = z
  .object({
    name: z.string().min(1).max(160).optional(),
    active: z.boolean().optional(),
    trigger: trigger.optional(),
    conditions: z.array(condition).max(20).optional(),
    actions: z.array(action).min(1).max(20).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update." });
