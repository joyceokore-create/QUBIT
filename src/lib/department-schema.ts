import { z } from "zod";
import { formMessages } from "@/lib/form-messages";

/**
 * Department — field rules shared by the New/Edit Department form and the server
 * (`CreateDepartmentInput` in src/server/departments.ts). Client-safe.
 */
export const departmentName = z.string().trim().min(1, formMessages.enter("a department name")).max(120, formMessages.maxLength("the name", 120));

export const DepartmentFormSchema = z.object({ name: departmentName });

/** Server rejections that belong to one field of the department form. */
export const DEPARTMENT_ERROR_FIELD: Record<string, string> = {
  CYCLE: "parentId",
};
