import { z } from "zod";
import { formMessages } from "@/lib/form-messages";

/** Admin home › Grant Access — field rules shared by the drawer and the grant route. Client-safe. */
export const grantRole = z.string().trim().min(1, formMessages.choose("a role")).max(64, formMessages.maxLength("the role", 64));
export const grantMessage = z.string().trim().max(500, formMessages.maxLength("the message", 500));

export const GrantAccessFormSchema = z.object({ role: grantRole, message: grantMessage });
