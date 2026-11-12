import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { MAX_PAGE_SIZE, MAX_SEARCH } from "@/lib/list-state";
import { containsText } from "@/lib/list-query";
import { SEVERITY_ORDER } from "@/components/raid/severity";

// Risk/Issue.ownerId is a bare string with no Prisma relation to User (matching
// Portfolio.ownerId's existing convention) — resolve names with one extra query per list
// call, same pattern as src/server/audit.ts's listAuditLog().
export async function ownerNamesById(
  tx: Prisma.TransactionClient,
  ownerIds: (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(ownerIds.filter((id): id is string => !!id))];
  if (!ids.length) return new Map();
  const users = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

// ── UX5 (L4) — server-paged Risks & Issues ──────────────────────────────────────

/** Ids in the list URL: the same shape list-state's allow-list accepts; "none" = unset. */
const LIST_ID = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export const IdOrNone = z.union([z.literal("none"), LIST_ID]);

/**
 * What the Risks & Issues tables accept from the URL. Every field is re-validated by the
 * paged list functions with Zod (page size capped at MAX_PAGE_SIZE), so callers may pass the
 * raw, already allow-listed strings straight through.
 */
export interface RaidPageQuery {
  q?: string;
  page?: number;
  size?: number;
  /** A project id, or "none" for items with no project. */
  projectId?: string;
  /** An owner (user) id, or "none" for unowned items. */
  ownerId?: string;
  status?: string;
  severity?: string;
}

export const RaidPageBase = z.object({
  q: z.string().trim().max(MAX_SEARCH).default(""),
  page: z.number().int().min(1).max(1_000_000).default(1),
  size: z.number().int().min(1).max(MAX_PAGE_SIZE).default(10),
  projectId: IdOrNone.optional(),
  ownerId: IdOrNone.optional(),
  severity: z.enum(SEVERITY_ORDER).optional(),
});

// Case-insensitive "contains" with LIKE wildcards escaped (Prisma's `contains` doesn't escape
// % or _, so a search for "%" would match every row). One helper for every list search.
export { containsText };

/**
 * Owners whose name matches the search (owner ids are bare strings with no relation, so the
 * search resolves names first). Runs on the caller's tenant-scoped `tx`, so RLS limits it to
 * the tenant's own users. Capped: a search this broad is narrowed by its other fields anyway.
 */
export async function ownerIdsMatching(tx: Prisma.TransactionClient, q: string): Promise<string[]> {
  if (!q) return [];
  const users = await tx.user.findMany({ where: { name: containsText(q) }, select: { id: true }, take: 200 });
  return users.map((u) => u.id);
}

/** `{ projectId }` / `{ ownerId }` for a filter value, "none" meaning null. */
export const idOrNull = (v: string) => (v === "none" ? null : v);
