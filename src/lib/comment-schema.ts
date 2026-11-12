import { z } from "zod";
import { formMessages } from "@/lib/form-messages";

/** Comments — field rules shared by the discussion composer / promote form and the routes. Client-safe. */
export const commentBody = z.string().trim().min(1, "Write a comment.").max(4000, formMessages.maxLength("the comment", 4000));
export const promoteTitle = z.string().trim().min(1, formMessages.enter("what was decided")).max(200, formMessages.maxLength("the title", 200));
export const promoteRationale = z.string().trim().max(2000, formMessages.maxLength("the reason", 2000));

export const CommentFormSchema = z.object({ body: commentBody });
export const PromoteFormSchema = z.object({ title: promoteTitle, rationale: promoteRationale });
