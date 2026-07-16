/**
 * Production tenant bootstrap (MVP1 Phase D). Creates a tenant + first SystemAdmin
 * WITHOUT the demo seed (which ships synthetic users with a well-known password).
 * Idempotent: re-running updates brand/domains and leaves an existing admin untouched.
 *
 *   ADMIN_EMAIL=joyce.okore@riverbank.solutions ADMIN_NAME="Joyce Okore" \
 *     pnpm tsx scripts/bootstrap-tenant.ts --tenant riverbank
 *
 * Prints a one-time random password for a newly-created admin — distribute securely,
 * then have them reset it and enable MFA. No password is printed if the admin exists.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/db";
import { withTenant } from "../src/lib/tenant";
import { hashPassword } from "../src/lib/password";

// Known tenant profiles (brand + real domains). Extend as tenants are onboarded.
const TENANTS: Record<string, { name: string; brandColor: string; brandLight: string; domains: string[] }> = {
  riverbank: {
    name: "Riverbank Group",
    brandColor: "#ED1C24",
    brandLight: "#FDECEC",
    domains: ["riverbank.solutions"],
  },
};

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const slug = argValue("--tenant") ?? "riverbank";
  const profile = TENANTS[slug];
  if (!profile) throw new Error(`No bootstrap profile for tenant "${slug}". Add one to TENANTS.`);

  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const adminName = process.env.ADMIN_NAME ?? adminEmail;
  if (!adminEmail) throw new Error("Set ADMIN_EMAIL (and optionally ADMIN_NAME).");

  // Tenant (idempotent upsert of brand + domains).
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: { name: profile.name, brandColor: profile.brandColor, brandLight: profile.brandLight, domains: profile.domains },
    create: { slug, name: profile.name, brandColor: profile.brandColor, brandLight: profile.brandLight, domains: profile.domains },
  });
  console.log(`[bootstrap] tenant ${slug} ready (${tenant.id})`);

  await withTenant({ tenantId: tenant.id, userId: "bootstrap" }, async (tx) => {
    const existing = await tx.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
      select: { id: true },
    });
    if (existing) {
      // Ensure the SystemAdmin role is present, but don't touch the password.
      const hasRole = await tx.roleAssignment.findFirst({ where: { userId: existing.id, role: "SystemAdmin" } });
      if (!hasRole) await tx.roleAssignment.create({ data: { tenantId: tenant.id, userId: existing.id, role: "SystemAdmin" } });
      console.log(`[bootstrap] admin ${adminEmail} already exists — left password untouched.`);
      return;
    }
    const pw = `Qbt!${randomBytes(9).toString("base64url")}${randomBytes(6).toString("hex")}9A`;
    const admin = await tx.user.create({
      data: { tenantId: tenant.id, email: adminEmail, name: adminName ?? adminEmail, status: "ACTIVE", passwordHash: await hashPassword(pw), mustChangePassword: true },
    });
    await tx.roleAssignment.create({ data: { tenantId: tenant.id, userId: admin.id, role: "SystemAdmin" } });
    console.log(`\n[bootstrap] created SystemAdmin ${adminEmail}`);
    console.log(`  TEMP PASSWORD: ${pw}`);
    console.log("  Distribute securely, then reset it and enable MFA at /settings/mfa.\n");
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
