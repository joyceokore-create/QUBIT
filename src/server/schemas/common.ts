import { z } from "zod";

/**
 * Shared request primitives (docs/clickup-transformation/05-api-spec.md).
 * All endpoint schemas `.strict()` to reject unknown keys. Ids are cuid.
 */

export const cuid = z.string().cuid();

export const locationType = z.enum(["SPACE", "FOLDER", "LIST", "EVERYTHING", "USER"]);

/** Keyset pagination: `?cursor=&limit=` (max 100). */
export const pagination = z
  .object({
    cursor: cuid.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

/** Editor content is opaque TipTap JSON at this layer; validated per-feature later. */
export const editorJson = z.record(z.unknown());
