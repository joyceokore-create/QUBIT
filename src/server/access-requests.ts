import { prisma } from "@/lib/db";
import { REQUESTABLE_ROLES, type DeclineReason, type RequestableRole } from "@/lib/access-request-schema";
import { retentionCutoff } from "@/lib/retention";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { z } from "zod";
import type { AccessRequest, Prisma } from "@prisma/client";
import { pageInfo, type PageInfo } from "@/lib/list-state";
import { containsText } from "@/lib/list-query";
import { createUser, type CreateUserResult } from "@/server/users";

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
  // UX fidelity Tier 1: the "Requested Role" filter (a REQUESTABLE_ROLES key).
  role: z.enum(REQUESTABLE_ROLES.map((r) => r.key) as [RequestableRole, ...RequestableRole[]]).optional(),
  // UX11: "queue" = NEW first, then newest (the Access requests page); "oldest" = oldest
  // first (Admin home's Waiting tab); "reviewed" = most recently reviewed first.
  sort: z.enum(["queue", "oldest", "reviewed"]).default("queue"),
});
export type AccessRequestListQuery = z.input<typeof AccessRequestListQuery>;

/** System read (no tenant scope) — NEW first, then newest, paged in SQL. */
export async function listAccessRequestsPaged(input: AccessRequestListQuery): Promise<{ rows: AccessRequest[]; info: PageInfo }> {
  const q = AccessRequestListQuery.parse(input);
  const and: Prisma.AccessRequestWhereInput[] = [];
  if (q.q) and.push({ OR: [{ fullName: containsText(q.q) }, { email: containsText(q.q) }, { company: containsText(q.q) }] });
  if (q.status) and.push({ status: q.status });
  if (q.role) and.push({ requestedRole: q.role });
  const where: Prisma.AccessRequestWhereInput = and.length ? { AND: and } : {};
  const total = await prisma.accessRequest.count({ where });
  const info = pageInfo(total, q.page, q.size);
  const orderBy: Prisma.AccessRequestOrderByWithRelationInput[] =
    q.sort === "oldest"
      ? [{ createdAt: "asc" }, { id: "asc" }]
      : q.sort === "reviewed"
        ? [{ reviewedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "asc" }]
        : [{ status: "asc" }, { createdAt: "desc" }, { id: "asc" }];
  const rows = total ? await prisma.accessRequest.findMany({ where, orderBy, skip: info.skip, take: info.size }) : [];
  return { rows, info };
}

/** Header numbers for the queue: everything, and how many are still NEW. */
export async function accessRequestTotals(): Promise<{ total: number; new: number }> {
  const [total, fresh] = await Promise.all([prisma.accessRequest.count(), countNewAccessRequests()]);
  return { total, new: fresh };
}

/** UX11: how many requests sit in each status (Admin home's tab counts). System read. */
export async function accessRequestStatusCounts(): Promise<Record<(typeof ACCESS_REQUEST_STATUSES)[number], number>> {
  const groups = await prisma.accessRequest.groupBy({ by: ["status"], _count: { _all: true } });
  const out = { NEW: 0, REVIEWED: 0, DISMISSED: 0 };
  for (const g of groups) out[g.status] = g._count._all;
  return out;
}

/** UX11: when the oldest NEW request arrived (null when none wait). System read. */
export async function oldestNewAccessRequestAt(): Promise<Date | null> {
  const row = await prisma.accessRequest.findFirst({ where: { status: "NEW" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  return row?.createdAt ?? null;
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
  /** Context kept on the audit row only: a FIXED decline-reason code (never free text — D-F3b,
   *  so the row holds no personal data once the request is deleted), or the account a grant
   *  created. access_request has no column for either. */
  note: { reasonCode?: DeclineReason; userId?: string } = {},
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
      after: { status, ...(note.reasonCode ? { reasonCode: note.reasonCode } : {}), ...(note.userId ? { userId: note.userId } : {}) },
    });
    return updated;
  });
}

// ── UX11: Admin home › Review › Grant access ────────────────────────────────────

export const GrantAccessInput = z.object({
  // Validated in createUser against canonical + ACTIVE custom roles (and the Super Admin guard).
  role: z.string().trim().min(1).max(64),
  departmentId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  // UX fidelity Tier 1: "Message to <name> (optional)" — goes into the invite email only.
  message: z.string().trim().max(500).optional(),
});
export type GrantAccessInput = z.infer<typeof GrantAccessInput>;

/**
 * Grant a waiting request: create the person's account through the SAME engine as Users ›
 * "Create a user" (createUser — role validation, the Super Admin guard, invite or SSO, and
 * its audit rows), then mark the request REVIEWED (audited, carrying the new user's id).
 *
 * The name and email come from the request row, never from the client, so a grant can't be
 * used to create a different account. If createUser fails (e.g. EMAIL_TAKEN) it throws
 * before the request is touched, so the request stays waiting. The two steps are separate
 * transactions (createUser commits and mints the invite on its own); if the review write
 * failed after a successful create, the account exists and a retry reports EMAIL_TAKEN —
 * the admin can then dismiss the request.
 *
 * Callers must hold `iam:manage` (the queue) AND `users:invite` (account creation).
 */
export async function grantAccessRequest(
  ctx: TenantContext,
  id: string,
  input: GrantAccessInput,
): Promise<{ request: AccessRequest; created: CreateUserResult }> {
  const data = GrantAccessInput.parse(input);
  const req = await prisma.accessRequest.findUnique({ where: { id } });
  if (!req) throw new AccessRequestError("NOT_FOUND", "Access request not found.");
  if (req.status !== "NEW") throw new AccessRequestError("ALREADY_REVIEWED", "This request has already been reviewed.");

  const created = await createUser(ctx, {
    name: req.fullName,
    email: req.email,
    roles: [data.role],
    departmentId: data.departmentId ?? null,
    teamId: data.teamId ?? null,
    projectId: null,
    projectRole: null,
    inviteNote: data.message || undefined,
  });
  const request = await reviewAccessRequest(ctx, id, "REVIEWED", { userId: created.user.id });
  return { request, created };
}

// ── UX fidelity D-F3b: retention ────────────────────────────────────────────────────

/**
 * Delete approved and declined requests decided more than `days` ago. Waiting (NEW) requests
 * are never deleted. access_request is a system table (no tenant, no RLS), so this runs once
 * per night from a system job, not per tenant. Returns the count only — never names.
 */
export async function purgeDecidedAccessRequests(days: number, now: Date = new Date()): Promise<number> {
  const { count } = await prisma.accessRequest.deleteMany({
    where: { status: { in: ["REVIEWED", "DISMISSED"] }, reviewedAt: { lt: retentionCutoff(now, days) } },
  });
  return count;
}
