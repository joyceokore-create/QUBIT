import { z } from "zod";

/**
 * Admin › People › Import (CSV) — the one field the form checks (pasted or uploaded text), shared
 * with POST /api/admin/people-import. Row-level problems inside the file are NOT field errors:
 * the route reports them per line and the panel lists them. Client-safe.
 */
export const PEOPLE_CSV_MAX = 200_000;
export const peopleCsv = z
  .string()
  .trim()
  .min(1, "Paste your CSV or choose a file.")
  .max(PEOPLE_CSV_MAX, "The CSV must be 200,000 characters or fewer. Split it into smaller files.");

export const PeopleImportBodySchema = z.object({ csv: peopleCsv });
