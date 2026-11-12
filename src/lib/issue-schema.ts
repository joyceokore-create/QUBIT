import { z } from "zod";
import { formMessages } from "@/lib/form-messages";

/** New Issue — field rules shared by the form and the server (`CreateIssueInput`). Client-safe. */
export const issueTitle = z.string().trim().min(1, formMessages.enter("a title")).min(3, formMessages.minLength("the title", 3)).max(200, formMessages.maxLength("the title", 200));

export const NewIssueFormSchema = z.object({ title: issueTitle });
