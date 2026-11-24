import { z } from "zod";
import { formMessages } from "@/lib/form-messages";

/**
 * New Risk — field rules shared by the form and the server (`CreateRiskInput` in
 * src/server/risks.ts). Client-safe.
 */
export const riskTitle = z.string().trim().min(1, formMessages.enter("a title")).min(3, formMessages.minLength("the title", 3)).max(200, formMessages.maxLength("the title", 200));
export const riskScore = (what: string) =>
  z.number({ message: formMessages.range(what, 1, 5) }).int(formMessages.range(what, 1, 5)).min(1, formMessages.range(what, 1, 5)).max(5, formMessages.range(what, 1, 5));

/** What the New Risk form checks before sending (the server re-checks everything). */
export const NewRiskFormSchema = z.object({
  title: riskTitle,
  probability: riskScore("a probability"),
  impact: riskScore("an impact"),
});
