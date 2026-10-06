import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { isHeadOfProjects } from "@/lib/rbac";
import { withTenant, type TenantContext } from "@/lib/tenant";

/**
 * Milestone D — the roll-up distribution list (the handoff's `rollupRecipients` tenant
 * setting). Head-managed; a row is either a tenant user (picked from the candidates) or an
 * address the Head typed. Every change is audited. The list is also what the custom
 * builder's "Email" sends to, so there is exactly one place the roll-up can go.
 */

export class RecipientError extends Error {
  constructor(
    message: string,
    public code: "FORBIDDEN" | "NOT_FOUND" | "ALREADY_LISTED" | "BAD_INPUT",
  ) {
    super(message);
    this.name = "RecipientError";
  }
}

export interface RecipientRow {
  id: string;
  email: string;
  name: string | null;
  userId: string | null;
}

export interface RecipientCandidate {
  userId: string;
  name: string;
  email: string;
  roles: string[];
}

export const AddRecipientInput = z
  .object({
    userId: z.string().uuid().optional(),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
  })
  .refine((v) => Boolean(v.userId) !== Boolean(v.email), { message: "Pass a userId or an email, not both." });
export type AddRecipientInput = z.infer<typeof AddRecipientInput>;

const ENTITY = "rollup_recipient";
const CANDIDATE_ROLES = ["Executive", "HeadOfProjects", "HeadOfQA"];

function assertHead(ctx: TenantContext): void {
  if (!isHeadOfProjects(ctx)) throw new RecipientError("The roll-up list is the Head of PMs' to manage.", "FORBIDDEN");
}

export async function listRecipients(ctx: TenantContext): Promise<RecipientRow[]> {
  return withTenant(ctx, (tx) =>
    tx.rollupRecipient.findMany({ orderBy: [{ name: "asc" }, { email: "asc" }], select: { id: true, email: true, name: true, userId: true } }),
  );
}

/** Active users in the executive seats, minus anyone already listed. */
export async function listCandidates(ctx: TenantContext): Promise<RecipientCandidate[]> {
  return withTenant(ctx, async (tx) => {
    const [grants, listed] = await Promise.all([
      tx.roleAssignment.findMany({ where: { role: { in: CANDIDATE_ROLES } }, select: { userId: true, role: true } }),
      tx.rollupRecipient.findMany({ select: { userId: true, email: true } }),
    ]);
    const rolesByUser = new Map<string, string[]>();
    for (const g of grants) rolesByUser.set(g.userId, [...(rolesByUser.get(g.userId) ?? []), g.role]);
    const taken = new Set(listed.map((r) => r.userId).filter(Boolean));
    const takenEmails = new Set(listed.map((r) => r.email));
    const users = await tx.user.findMany({
      where: { id: { in: [...rolesByUser.keys()] }, status: "ACTIVE" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    return users
      .filter((u) => !taken.has(u.id) && !takenEmails.has(u.email.toLowerCase()))
      .map((u) => ({ userId: u.id, name: u.name, email: u.email, roles: rolesByUser.get(u.id) ?? [] }));
  });
}

export async function addRecipient(ctx: TenantContext, input: AddRecipientInput): Promise<RecipientRow> {
  assertHead(ctx);
  return withTenant(ctx, async (tx) => {
    let data: { email: string; name: string | null; userId: string | null };
    if (input.userId) {
      const user = await tx.user.findFirst({ where: { id: input.userId, status: "ACTIVE" }, select: { id: true, name: true, email: true } });
      if (!user) throw new RecipientError("No active user with that id.", "NOT_FOUND");
      data = { email: user.email.toLowerCase(), name: user.name, userId: user.id };
    } else {
      // A typed address that matches a tenant user becomes that user's row.
      const user = await tx.user.findFirst({ where: { email: { equals: input.email!, mode: "insensitive" } }, select: { id: true, name: true } });
      data = { email: input.email!, name: user?.name ?? null, userId: user?.id ?? null };
    }
    try {
      const row = await tx.rollupRecipient.create({
        data: { tenantId: ctx.tenantId, ...data, addedById: ctx.userId },
        select: { id: true, email: true, name: true, userId: true },
      });
      await audit(tx, ctx, { action: "create", entityType: ENTITY, entityId: row.id, after: { email: row.email, userId: row.userId } });
      return row;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new RecipientError("That address is already on the list.", "ALREADY_LISTED");
      }
      throw e;
    }
  });
}

export async function removeRecipient(ctx: TenantContext, id: string): Promise<void> {
  assertHead(ctx);
  await withTenant(ctx, async (tx) => {
    const row = await tx.rollupRecipient.findUnique({ where: { id }, select: { id: true, email: true, userId: true } });
    if (!row) throw new RecipientError("No such recipient.", "NOT_FOUND");
    await tx.rollupRecipient.delete({ where: { id } });
    await audit(tx, ctx, { action: "delete", entityType: ENTITY, entityId: row.id, before: { email: row.email, userId: row.userId } });
  });
}
