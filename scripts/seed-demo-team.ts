/**
 * Seed a DEMO delivery team on one project so the whole reporting chain can be walked
 * end to end: dev/QA/implementor weekly updates → PM acknowledges & confirms the
 * check-in → sends to the Head of PMs → Head's roll-up → executive.
 *
 *   pnpm tsx scripts/seed-demo-team.ts --tenant riverbank --project QUB [--dry-run]
 *   pnpm tsx scripts/seed-demo-team.ts --tenant riverbank --project QUB --remove
 *
 * The accounts are DELIBERATELY SYNTHETIC (`@demo.invalid`, "Demo …" names) per
 * CLAUDE.md rule 3 — no invented colleagues sitting in a production people list, and
 * `--remove` retires them again through the app's own soft-delete.
 *
 * It also gives the project a handful of tasks assigned to the demo members, because a
 * weekly update auto-drafts FROM BOARD ACTIVITY: with an empty board every member would
 * open their update and correctly see "a quiet week", which proves nothing.
 */
import { prisma } from "../src/lib/db";
import { withTenant, type TenantContext } from "../src/lib/tenant";
import { createUser, softDeleteUser } from "../src/server/users";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const DRY = process.argv.includes("--dry-run");
const REMOVE = process.argv.includes("--remove");

const TEAM = [
  { key: "pm", name: "Demo PM", email: "demo.pm@demo.invalid", role: "ProjectManager", group: "pm", projectRole: "Project Manager" },
  { key: "dev", name: "Demo Developer", email: "demo.dev@demo.invalid", role: "Member", group: "developer", projectRole: "Developer" },
  { key: "qa", name: "Demo QA", email: "demo.qa@demo.invalid", role: "Member", group: "qa", projectRole: "QA Engineer" },
  { key: "impl", name: "Demo Implementor", email: "demo.impl@demo.invalid", role: "Member", group: "implementor", projectRole: "Implementor" },
] as const;

/** Board activity for the week, so each member's update has real facts to carry. */
const TASKS: { title: string; assignee: (typeof TEAM)[number]["key"]; status: string; type: string }[] = [
  { title: "Demo — settlement API client", assignee: "dev", status: "Completed", type: "Feature" },
  { title: "Demo — retry on webhook timeout", assignee: "dev", status: "InProgress", type: "Bug" },
  { title: "Demo — regression pack for payouts", assignee: "qa", status: "Completed", type: "Chore" },
  { title: "Demo — UAT scenarios for agent portal", assignee: "qa", status: "InQA", type: "Chore" },
  { title: "Demo — branch rollout checklist", assignee: "impl", status: "Completed", type: "Chore" },
  { title: "Demo — merchant onboarding runbook", assignee: "impl", status: "InProgress", type: "Chore" },
];

async function main() {
  const slug = argValue("--tenant") ?? "riverbank";
  const code = argValue("--project");
  if (!code) throw new Error("Pass --project <CODE> (the project the demo team joins).");

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Tenant "${slug}" not found.`);

  const admin = await withTenant({ tenantId: tenant.id, userId: "system" }, (tx) =>
    tx.roleAssignment.findFirst({ where: { role: "PlatformSuperAdmin" }, select: { userId: true } }),
  );
  if (!admin) throw new Error("No Super Admin in this tenant to act as.");
  const ctx: TenantContext = { tenantId: tenant.id, userId: admin.userId, roles: ["PlatformSuperAdmin"] };

  const project = await withTenant(ctx, (tx) =>
    tx.project.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code } }, select: { id: true, name: true, code: true } }),
  );
  if (!project) throw new Error(`No project with code ${code} in ${slug}.`);

  // ── Remove ────────────────────────────────────────────────────────────────
  if (REMOVE) {
    const existing = await withTenant(ctx, (tx) =>
      tx.user.findMany({ where: { email: { endsWith: "@demo.invalid" }, status: { not: "DELETED" } }, select: { id: true, email: true } }),
    );
    await withTenant(ctx, (tx) => tx.projectTask.deleteMany({ where: { title: { startsWith: "Demo — " } } }));
    for (const u of existing) {
      if (!DRY) await softDeleteUser(ctx, u.id);
      console.log(`retired ${u.email}`);
    }
    console.log(`${DRY ? "[dry-run] " : ""}removed ${existing.length} demo accounts and their demo tasks.`);
    return;
  }

  // ── Create ────────────────────────────────────────────────────────────────
  console.log(`Demo team on ${project.code} — ${project.name}\n`);
  const ids = new Map<string, string>();
  const links: string[] = [];

  for (const m of TEAM) {
    const found = await withTenant(ctx, (tx) =>
      tx.user.findFirst({ where: { email: m.email, status: { not: "DELETED" } }, select: { id: true } }),
    );
    if (found) {
      ids.set(m.key, found.id);
      console.log(`  ${m.name} <${m.email}> — exists`);
      continue;
    }
    if (DRY) {
      console.log(`  ${m.name} <${m.email}> — WOULD CREATE (${m.role}, ${m.projectRole})`);
      continue;
    }
    const res = await createUser(ctx, {
      name: m.name,
      email: m.email,
      roles: [m.role],
      userGroups: [m.group],
      primaryGroup: m.group,
      projectId: project.id,
      projectRole: m.projectRole,
    } as Parameters<typeof createUser>[1]);
    ids.set(m.key, res.user.id);
    console.log(`  ${m.name} <${m.email}> — CREATED (${m.role} · ${m.projectRole})`);
    if (res.acceptUrl) links.push(`${m.name}: ${res.acceptUrl}`);
  }

  if (!DRY) {
    await withTenant(ctx, async (tx) => {
      // The PM leads the project — check-ins and escalations route to a person.
      const pmId = ids.get("pm");
      if (pmId) await tx.project.update({ where: { id: project.id }, data: { leadUserId: pmId } });

      for (const t of TASKS) {
        const assigneeId = ids.get(t.assignee);
        if (!assigneeId) continue;
        const exists = await tx.projectTask.findFirst({ where: { projectId: project.id, title: t.title } });
        const data = {
          status: t.status,
          type: t.type,
          priority: "Medium",
          approvalStatus: "Published",
          assigneeId,
          // "Done this week" is judged on updatedAt (member-reports.ts), which Prisma
          // stamps on every write — so a freshly seeded Completed task counts as this
          // week's work without a field of its own.
          lastActivityAt: new Date(),
        };
        if (exists) await tx.projectTask.update({ where: { id: exists.id }, data });
        else await tx.projectTask.create({ data: { ...data, tenantId: tenant.id, projectId: project.id, title: t.title } });
      }
    });
    console.log(`\n  PM set as project lead · ${TASKS.length} demo tasks on the board`);
  }

  if (links.length) {
    console.log(`\nOne-time accept links (72h, no email is sent — hand these over yourself):`);
    for (const l of links) console.log(`  ${l}`);
  }
  console.log(`\n${DRY ? "Dry run — nothing written." : "Done."}`);
}

main()
  .catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
