import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { z } from "zod";
import type { AccessRequest, Prisma } from "@prisma/client";
import { pageInfo, type PageInfo } from "@/lib/list-state";
import { containsText } from "@/lib/list-query";

/** Thrown for expected admin-review failures (e.g. unknown id). Carries a stable `code`. */
export class AccessRequestError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AccessRequestError";
    this.code = code;
  }
}

/** System read (no tenant scope): NEW first, then newest. */
export function listAccessRequests(): Promise<AccessRequest[]> {
  return prisma.accessRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

// ── UX5 (L4): server-paged review queue ────────────────────────────────────────
// access_request is a SYSTEM table with no tenant_id: requests arrive from the public
// request-access form before any tenant exists, so these reads use bare `prisma` exactly like
// listAccessRequests. The caller MUST gate on `iam:manage` (the page and the API do).

export const ACCESS_REQUEST_STATUSES = ["NEW", "REVIEWED", "DISMISSED"] as const;

/** One page of the queue: search (name, email, company), status filter, page size ≤ 100. */
export const AccessRequestListQuery = z.object({
  q: z.string().trim().max(100).default(""),
  page: z.number().int().min(1).max(1_000_000).default(1),
  size: z.number().int().min(1).max(100),
  status: z.enum(ACCESS_REQUEST_STATUSES).optional(),
});
export type AccessRequestListQuery = z.input<typeof AccessRequestListQuery>;

/** System read (no tenant scope) — NEW first, then newest, paged in SQL. */
export async function listAccessRequestsPaged(input: AccessRequestListQuery): Promise<{ rows: AccessRequest[]; info: PageInfo }> {
  const q = AccessRequestListQuery.parse(input);
  const and: Prisma.AccessRequestWhereInput[] = [];
  if (q.q) and.push({ OR: [{ fullName: containsText(q.q) }, { email: containsText(q.q) }, { company: containsText(q.q) }] });
  if (q.status) and.push({ status: q.status });
  const where: Prisma.AccessRequestWhereInput = and.length ? { AND: and } : {};
  const total = await prisma.accessRequest.count({ where });
  const info = pageInfo(total, q.page, q.size);
  const rows = total
    ? await prisma.accessRequest.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }, { id: "asc" }], skip: info.skip, take: info.size })
    : [];
  return { rows, info };
}

/** Header numbers for the queue: everything, and how many are still NEW. */
export async function accessRequestTotals(): Promise<{ total: number; new: number }> {
  const [total, fresh] = await Promise.all([prisma.accessRequest.count(), countNewAccessRequests()]);
  return { total, new: fresh };
}

/** Count of pending (NEW) requests — feeds the admin-nav badge. */
export function countNewAccessRequests(): Promise<number> {
  return prisma.accessRequest.count({ where: { status: "NEW" } });
}

/**
 * Mark a request Reviewed/Dismissed. The access_request UPDATE is a system-table write, but
 * we run it inside withTenant(ctx) so the audit_log row is tenant-scoped to the reviewing
 * admin and atomic with the status change (docs/07-auth-rbac.md).
 */
export async function reviewAccessRequest(
  ctx: Pick<TenantContext, "tenantId" | "userId">,
  id: string,
  status: "REVIEWED" | "DISMISSED",
): Promise<AccessRequest> {
  const existing = await prisma.accessRequest.findUnique({ where: { id } });
  if (!existing) throw new AccessRequestError("NOT_FOUND", "Access request not found.");

  return withTenant(ctx, async (tx) => {
    const updated = await tx.accessRequest.update({
      where: { id },
      data: { status, reviewedById: ctx.userId, reviewedAt: new Date() },
    });
    await audit(tx, ctx, {
      action: "access_request_review",
      entityType: "access_request",
      entityId: id,
      before: { status: existing.status },
      after: { status },
    });
    return updated;
  });
}
