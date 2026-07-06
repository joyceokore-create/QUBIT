import type { Prisma } from "@prisma/client";

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
