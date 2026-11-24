import { z } from "zod";
import { formMessages } from "@/lib/form-messages";

/**
 * Portfolio and programme — field rules shared by the Edit Portfolio and New Programme forms and
 * their routes (`UpdatePortfolioSchema` / `CreateProgrammeSchema` in src/server/portfolios.ts).
 * Client-safe.
 */
export const portfolioName = z.string().trim().min(1, formMessages.enter("a portfolio name")).min(2, formMessages.minLength("the name", 2)).max(120, formMessages.maxLength("the name", 120));
export const programmeName = z.string().trim().min(1, formMessages.enter("a programme name")).min(2, formMessages.minLength("the name", 2)).max(120, formMessages.maxLength("the name", 120));
export const portfolioDescription = z.string().trim().max(500, formMessages.maxLength("the description", 500));
export const portfolioIdChoice = z.string().min(1, formMessages.choose("a portfolio")).uuid(formMessages.choose("a portfolio"));

export const EditPortfolioFormSchema = z.object({ name: portfolioName, description: portfolioDescription });
export const NewProgrammeFormSchema = z.object({ name: programmeName, portfolioId: portfolioIdChoice });

/** Server rejections that belong to one field of the portfolio forms. */
export const PORTFOLIO_ERROR_FIELD: Record<string, string> = {
  OWNER_INELIGIBLE: "ownerId",
  BAD_MARKET: "marketIds",
};
