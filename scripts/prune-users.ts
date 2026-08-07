/**
 * Retire every user except the ones named in --keep, using the app's own soft-delete
 * (src/server/users.ts softDeleteUser): roles removed, PII scrubbed, status DELETED,
 * audit row written with the pre-scrub name/email. It is NOT a row delete — the audit
 * trail and every reference stay intact (docs/11).
 *
 *   pnpm tsx scripts/prune-users.ts --tenant riverbank --keep joyce.okore@riverbank.solutions --dry-run
 *   pnpm tsx scripts/prune-users.ts --tenant riverbank --keep joyce.okore@riverbank.solutions
 *
 * Refuses to run if the keep-list would leave the tenant with no PlatformSuperAdmin —
 * locking everyone out of production is not a recoverable mistake.
 *
 * NOTE the scrub is one-way: a retired person's email becomes deleted-<id>@<slug>.invalid,
 * so bringing them back means a fresh invite, not an undelete.
 */
import { prisma } from "../src/lib/db";
import { withTenant, type TenantContext } from "../src/lib/tenant";
import { softDeleteUser } from "../src/server/users";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const DRY = process.argv.includes("--dry-run");

async function main() {
  const slug = argValue("--tenant") ?? "riverbank";
  const keep = (argValue("--keep") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!keep.length) throw new Error("Pass --keep <email[,email]> — refusing to delete everyone.");

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Tenant "${slug}" not found.`);

  const actor = await withTenant({ tenantId: tenant.id, userId: "system" }, (tx) =>
    tx.user.findFirst({ where: { email: keep[0] }, select: { id: true, email: true } }),
  );
  if (!actor) throw new Error(`Keeper ${keep[0]} not found in ${slug} — nothing done.`);

  // Act AS the keeper: softDeleteUser refuses self-deletion, which is the guard that
  // keeps this script from removing the very account it is preserving.
  const ctx: TenantContext = { tenantId: tenant.id, userId: actor.id, roles: ["PlatformSuperAdmin"] };

  const users = await withTenant(ctx, (tx) =>
    tx.user.findMany({
      where: { status: { not: "DELETED" } },
      select: { id: true, email: true, name: true, roles: { select: { role: true } } },
      orderBy: { email: "asc" },
    }),
  );

  const doomed = users.filter((u) => !keep.includes(u.email.toLowerCase()));
  const kept = users.filter((u) => keep.includes(u.email.toLowerCase()));

  const survivingAdmins = kept.filter((u) => u.roles.some((r: { role: string }) => r.role === "PlatformSuperAdmin"));
  if (!survivingAdmins.length) {
    throw new Error("The keep-list holds no PlatformSuperAdmin — refusing to lock everyone out.");
  }

  console.log(`KEEP  (${kept.length}):`);
  for (const u of kept) console.log(`   ${u.email}  [${u.roles.map((r: { role: string }) => r.role).join(",") || "no role"}]`);
  console.log(`RETIRE (${doomed.length}):`);
  for (const u of doomed) console.log(`   ${u.email}  [${u.roles.map((r: { role: string }) => r.role).join(",") || "no role"}]`);

  if (DRY) {
    console.log("\nDry run — nothing written.");
    return;
  }
  for (const u of doomed) {
    await softDeleteUser(ctx, u.id);
    console.log(`   retired ${u.email}`);
  }
  console.log(`\nDone — ${doomed.length} retired, ${kept.length} kept.`);
}

main()
  .catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
