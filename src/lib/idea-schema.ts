import { z } from "zod";
import { formMessages } from "@/lib/form-messages";
import { reasonField } from "@/lib/reason-schema";

/**
 * Ideas — field rules shared by the New Idea / Park / Merge dialogs and the routes
 * (`SubmitIdeaInput` in src/server/ideas.ts, the triage route). Client-safe.
 */
export const ideaTitle = z.string().trim().min(1, formMessages.enter("a title")).min(4, formMessages.minLength("the title", 4)).max(140, formMessages.maxLength("the title", 140));
export const ideaSponsor = z.string().trim().min(1, formMessages.enter("a sponsor")).min(2, formMessages.minLength("the sponsor", 2)).max(120, formMessages.maxLength("the sponsor", 120));
export const ideaProblem = z.string().trim().min(1, "Describe the problem it solves.").min(10, "Describe the problem in at least 10 characters.").max(2000, formMessages.maxLength("the description", 2000));
export const ideaExpectedValue = z.string().trim().max(500, formMessages.maxLength("the expected value", 500));
export const parkReason = reasonField(5, 1000);
export const mergeTarget = z.string().min(1, formMessages.choose("a project")).uuid(formMessages.choose("a project"));

export const NewIdeaFormSchema = z.object({ title: ideaTitle, sponsor: ideaSponsor, problem: ideaProblem, expectedValue: ideaExpectedValue });
export const ParkIdeaFormSchema = z.object({ reason: parkReason });
export const MergeIdeaFormSchema = z.object({ projectId: mergeTarget });
