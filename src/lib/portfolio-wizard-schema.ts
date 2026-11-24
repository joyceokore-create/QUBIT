import { z } from "zod";
import { portfolioDescription, portfolioName } from "@/lib/portfolio-schema";

/**
 * New Portfolio wizard — what the Identity step checks before moving on (the server re-checks
 * everything in `CreatePortfolioSchema`, src/server/portfolios.ts). Field rules and copy come
 * from portfolio-schema.ts so every portfolio form says the same thing. Client-safe.
 */
export const PortfolioWizardFormSchema = z.object({ name: portfolioName, description: portfolioDescription });

/** The step each server-reported field sits on. */
export const PORTFOLIO_WIZARD_FIELD_STEP: Record<string, number> = {
  name: 0,
  description: 0,
  ownerId: 0,
  marketIds: 1,
};
