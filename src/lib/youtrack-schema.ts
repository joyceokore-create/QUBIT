import { z } from "zod";
import { formMessages } from "@/lib/form-messages";

/**
 * Configs › Integrations › YouTrack — the connect form's field rules, shared by the panel and the
 * routes (`TestInput` in src/server/integrations/youtrack.ts). Client-safe. Format only: whether
 * the host is allowed and the token works is the connection test's job.
 */
const URL_MESSAGE = "Enter an https:// address, like https://your-org.youtrack.cloud.";
export const youtrackBaseUrl = z
  .string()
  .trim()
  .min(1, formMessages.enter("the instance URL"))
  .regex(/^https:\/\/\S+$/i, URL_MESSAGE)
  .url(URL_MESSAGE)
  .max(300, formMessages.maxLength("the URL", 300));
export const youtrackToken = z.string().trim().min(1, formMessages.enter("the permanent token")).max(500, formMessages.maxLength("the token", 500));

export const YoutrackConnectFormSchema = z.object({ baseUrl: youtrackBaseUrl, token: youtrackToken });

/** Replace-token: only the token changes (the URL is kept). */
export const YoutrackReplaceTokenSchema = z.object({
  token: z.string().trim().min(1, formMessages.enter("the new token")).max(500, formMessages.maxLength("the token", 500)),
});
