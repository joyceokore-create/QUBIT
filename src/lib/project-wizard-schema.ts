import { z } from "zod";
import { formMessages } from "@/lib/form-messages";

/**
 * New Project wizard — field rules shared by the wizard (errors on the step's fields) and the
 * server (`CreateProjectWizardInput` in src/server/project-wizard.ts), so both say the same
 * thing. Client-safe.
 */
export const PROJECT_CODE_RE = /^[A-Z0-9]{2,10}$/;
const CODE_MESSAGE = "Code must be 2–10 letters or digits.";

export const projectName = z.string().trim().min(1, formMessages.enter("a project name")).min(2, formMessages.minLength("the name", 2)).max(120, formMessages.maxLength("the name", 120));
/** Server side: an optional code, upper-cased. */
export const projectCode = z.string().trim().toUpperCase().regex(PROJECT_CODE_RE, CODE_MESSAGE);
export const projectPortfolioId = z.string().min(1, formMessages.choose("a portfolio")).uuid(formMessages.choose("a portfolio"));

const WINDOW_MESSAGE = "The end date can’t be before the start date.";
/** An assignment window on a team row: the end can't come before the start. Returns the issue path (relative to the row). */
export function windowIssue(row: { startDate?: string | null; endDate?: string | null }): "endDate" | null {
  if (row.startDate && row.endDate && new Date(row.startDate) > new Date(row.endDate)) return "endDate";
  return null;
}
export function refineWindow<T extends { startDate?: string | null; endDate?: string | null }>(row: T, ctx: z.RefinementCtx) {
  if (windowIssue(row)) ctx.addIssue({ code: "custom", path: ["endDate"], message: WINDOW_MESSAGE });
}

const allocation = z.number({ message: formMessages.range("an allocation", 1, 100) }).int(formMessages.range("an allocation", 1, 100)).min(1, formMessages.range("an allocation", 1, 100)).max(100, formMessages.range("an allocation", 1, 100));

/** A team row as the form holds it (dates are yyyy-mm-dd or empty). */
export const TeamRowFormSchema = z
  .object({ allocationPct: allocation, startDate: z.string(), endDate: z.string() })
  .superRefine(refineWindow);

/** What the wizard checks before leaving a step / creating. The code is optional (empty = auto). */
export const ProjectWizardFormSchema = z.object({
  name: projectName,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || PROJECT_CODE_RE.test(v), CODE_MESSAGE),
  portfolioId: projectPortfolioId,
  team: z.array(TeamRowFormSchema),
});

export { allocation as projectAllocation };

/** Server rejections that belong to one field of the wizard, and the step they sit on. */
export const PROJECT_ERROR_FIELD: Record<string, string> = {
  CODE_TAKEN: "code",
  PORTFOLIO_NOT_FOUND: "portfolioId",
  PROGRAMME_NOT_FOUND: "programmeId",
  PROGRAMME_MISMATCH: "programmeId",
  TEMPLATE_NOT_FOUND: "checkpointTemplateId",
  BAD_MARKET: "marketIds",
};
