import { z } from "zod";
import { formMessages } from "@/lib/form-messages";

/** Team — field rules shared by the team form and the server (`src/server/teams.ts`). Client-safe. */
export const teamName = z.string().trim().min(1, formMessages.enter("a team name")).max(120, formMessages.maxLength("the name", 120));
export const teamDescription = z.string().max(500, formMessages.maxLength("the description", 500));

export const TeamFormSchema = z.object({ name: teamName, description: teamDescription });

/** Server rejections that belong to one field of the team form. */
export const TEAM_ERROR_FIELD: Record<string, string> = {
  NAME_TAKEN: "name",
};
