import { z } from "zod";

/**
 * UX5 — list pages (UX plan L1–L5). The one paging/search/filter contract every list table
 * uses, whether it pages in the browser (small, bounded tables) or on the server (Audit log,
 * Users, Access requests, Risks & Issues). Pure and client-safe; the server side validates the
 * same URL with `parseListParams` before it touches Prisma.
 *
 * URL keys: `q` (search), `page` (1-based), `size` (rows per page), `tab`, plus each page's
 * own filter keys. Defaults are left out of the URL so links stay short.
 */

export const PAGE_SIZES = [5, 10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const MIN_PAGE_SIZE = 5;
export const MAX_PAGE_SIZE = 100;
export const MAX_SEARCH = 100;

export function isPageSize(n: number): n is PageSize {
  return (PAGE_SIZES as readonly number[]).includes(n);
}

/** A rows-per-page value from the URL or storage, else the table's default. */
export function parseSize(raw: string | null | undefined, fallback: PageSize): PageSize {
  const n = Number(raw);
  return Number.isInteger(n) && isPageSize(n) ? n : fallback;
}

/** A 1-based page from the URL; anything odd reads as page 1. */
export function parsePage(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 1_000_000 ? n : 1;
}

/** Trimmed search text, capped. */
export function parseSearch(raw: string | null | undefined): string {
  return (raw ?? "").trim().slice(0, MAX_SEARCH);
}

export interface PageInfo {
  page: number;
  size: number;
  total: number;
  pageCount: number;
  /** 1-based index of the first row shown (0 when empty). */
  from: number;
  /** 1-based index of the last row shown (0 when empty). */
  to: number;
  skip: number;
}

/** Page maths for `total` rows. An out-of-range page clamps to the last page. */
export function pageInfo(total: number, page: number, size: number): PageInfo {
  const pageCount = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pageCount);
  const skip = (p - 1) * size;
  return { page: p, size, total, pageCount, skip, from: total ? skip + 1 : 0, to: Math.min(skip + size, total) };
}

/** Browser paging: the visible slice plus its PageInfo. */
export function paginate<T>(rows: T[], page: number, size: number): { rows: T[]; info: PageInfo } {
  const info = pageInfo(rows.length, page, size);
  return { rows: rows.slice(info.skip, info.skip + size), info };
}

/** Page buttons to show: first, last, and a window around the current page, with gaps. */
export function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const keep = new Set([1, pageCount, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => keep.add(n));
  if (page >= pageCount - 2) [pageCount - 3, pageCount - 2, pageCount - 1].forEach((n) => keep.add(n));
  const sorted = [...keep].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

/** Case-insensitive "contains" over several fields — browser search across ALL rows (L1). */
export function matchesSearch(q: string, ...fields: (string | null | undefined)[]): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(needle));
}

// ── Server side ─────────────────────────────────────────────────────────────────

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Validate a server-paged list's URL (L4). Filters are allow-listed: each filter key maps to
 * the values it may take (or `"id"` for a uuid/cuid-shaped id, or `"text"` for short free
 * text). Anything else is dropped, so nothing unvalidated reaches a Prisma `where`.
 */
export function parseListParams<F extends Record<string, readonly string[] | "id" | "text">>(
  sp: SearchParams,
  opts: { defaultSize: PageSize; filters: F },
): { q: string; page: number; size: PageSize; filters: { [K in keyof F]?: string } } {
  const filters: { [K in keyof F]?: string } = {};
  const idShape = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
  const textShape = z.string().trim().min(1).max(MAX_SEARCH);
  for (const key of Object.keys(opts.filters) as (keyof F & string)[]) {
    const raw = first(sp[key]);
    if (raw === undefined || raw === "") continue;
    const rule = opts.filters[key];
    const ok =
      rule === "id" ? idShape.safeParse(raw).success : rule === "text" ? textShape.safeParse(raw).success : (rule as readonly string[]).includes(raw);
    if (ok) filters[key] = raw;
  }
  return {
    q: parseSearch(first(sp.q)),
    page: parsePage(first(sp.page)),
    size: parseSize(first(sp.size), opts.defaultSize),
    filters,
  };
}
