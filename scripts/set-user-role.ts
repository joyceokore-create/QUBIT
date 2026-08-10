/**
 * Change a user's tenant role(s) through the app's own engine, so the change is audited
 * and the privilege-escalation guards apply — not a raw SQL UPDATE.
 *
 *   pnpm tsx scripts/set-user-role.ts --tenant riverbank --email x@y.z --roles HeadOfProjects [--dry-run]
 *
 * Acts as a Super Admin in the tenant (required to grant privileged roles). Roles REPLACE
 * the existing set, matching the admin UI's behaviour.
 */
import { prisma } from "../src/lib/db";
import { withTenant, type TenantContext } from "../src/lib/tenant";
import { updateUserRoles } from "../src/server/users";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const DRY = process.argv.includes("--dry-run");

async function main() {
  const slug = argValue("--tenant") ?? "riverbank";
  const email = (argValue("--email") ?? "").toLowerCase();
  const roles = (argValue("--roles") ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  if (!email || !roles.length) throw new Error("Pass --email and --roles.");

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Tenant "${slug}" not found.`);

  const [target, admin] = await withTenant({ tenantId: tenant.id, userId: "system" }, async (tx) => [
    await tx.user.findFirst({
      where: { email, status: { not: "DELETED" } },
      select: { id: true, email: true, name: true, roles: { select: { role: true } } },
    }),
    await tx.roleAssignment.findFirst({ where: { role: "PlatformSuperAdmin" }, select: { userId: true } }),
  ]);
  if (!target) throw new Error(`No active user ${email} in ${slug}.`);
  if (!admin) throw new Error("No Super Admin in this tenant to act as.");

  const before = target.roles.map((r: { role: string }) => r.role);
  console.log(`${target.name} <${target.email}>`);
  console.log(`  roles: [${before.join(", ") || "none"}]  →  [${roles.join(", ")}]`);
  if (DRY) {
    console.log("Dry run — nothing written.");
    return;
  }
  const ctx: TenantContext = { tenantId: tenant.id, userId: admin.userId, roles: ["PlatformSuperAdmin"] };
  await updateUserRoles(ctx, target.id, roles);
  console.log("Done — change audited. The new role reaches them at their next sign-in (roles are baked into the session).");
}

main()
  .catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
