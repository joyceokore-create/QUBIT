/**
 * Riverbank onboarding importer (MVP1). Bulk-loads REAL people, departments, teams,
 * projects and resource allocations from CSVs into the Riverbank tenant — idempotent,
 * dry-run by default.
 *
 *   pnpm tsx scripts/import-riverbank.ts            # dry run (no writes), prints a plan
 *   pnpm tsx scripts/import-riverbank.ts --execute  # writes; emits import/import-report.json
 *   pnpm tsx scripts/import-riverbank.ts --dir ./import --tenant riverbank --execute
 *
 * CSVs (all optional) live in --dir (default ./import, git-ignored):
 *   departments.csv  name,parent,head            (parent/head by name/email; blank ok)
 *   people.csv       name,email,roles,department,manager   (roles = "|"-separated)
 *   teams.csv        name,description,lead,members (lead=email; members="|"-separated emails)
 *   projects.csv     code,name,description,type,priority,status,dueDate,budget,lead
 *   allocations.csv  projectCode,email,role,allocationPct
 *
 * Data handling: real PII stays in these CSVs + the DB only — never committed (see
 * .gitignore). New users get a random temp password, listed in the report for secure
 * hand-off; recommend reset + MFA. All writes run under one Riverbank withTenant (RLS).
 */
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
import { withTenant } from "../src/lib/tenant";
import { hashPassword } from "../src/lib/password";
import { ROLE_PERMISSIONS } from "../src/lib/rbac";

const VALID_ROLES = new Set(Object.keys(ROLE_PERMISSIONS));

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const execute = args.includes("--execute");
const dir = argValue("--dir") ?? "./import";
const tenantSlug = argValue("--tenant") ?? "riverbank";
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

// ── tiny CSV parser (quoted fields, commas, CRLF) ─────────────────────────────
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ""));
  if (nonEmpty.length === 0) return [];
  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()));
    return obj;
  });
}

function loadCsv(name: string): Record<string, string>[] {
  const path = join(dir, name);
  if (!existsSync(path)) return [];
  return parseCsv(readFileSync(path, "utf8"));
}

function tempPassword(): string {
  // 24 chars, mixed classes, satisfies the min-length policy comfortably.
  return `Rvb!${randomBytes(9).toString("base64url")}${randomBytes(6).toString("hex")}9A`;
}

interface Report {
  mode: "dry-run" | "execute";
  tenant: string;
  counts: Record<string, { created: number; skipped: number }>;
  warnings: string[];
  tempCredentials: { email: string; tempPassword: string }[];
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`Tenant "${tenantSlug}" not found. Seed or create it first.`);

  const departments = loadCsv("departments.csv");
  const people = loadCsv("people.csv");
  const teams = loadCsv("teams.csv");
  const projects = loadCsv("projects.csv");
  const allocations = loadCsv("allocations.csv");

  const report: Report = {
    mode: execute ? "execute" : "dry-run",
    tenant: tenantSlug,
    counts: {
      departments: { created: 0, skipped: 0 },
      people: { created: 0, skipped: 0 },
      teams: { created: 0, skipped: 0 },
      projects: { created: 0, skipped: 0 },
      allocations: { created: 0, skipped: 0 },
    },
    warnings: [],
    tempCredentials: [],
  };

  await withTenant({ tenantId: tenant.id, userId: "import-script" }, async (tx) => {
    // 1) Departments (two passes so parents resolve regardless of row order).
    const deptIdByName = new Map<string, string>();
    for (const pass of [0, 1]) {
      for (const d of departments) {
        if (!d.name) continue;
        if (deptIdByName.has(d.name)) continue;
        const existing = await tx.department.findFirst({ where: { name: d.name }, select: { id: true } });
        if (existing) {
          deptIdByName.set(d.name, existing.id);
          if (pass === 0) report.counts.departments.skipped++;
          continue;
        }
        const parentId = d.parent ? deptIdByName.get(d.parent) ?? null : null;
        if (d.parent && !parentId && pass === 0) continue; // wait for pass 1
        if (execute) {
          const created = await tx.department.create({
            data: { tenantId: tenant.id, name: d.name, parentId },
          });
          deptIdByName.set(d.name, created.id);
        } else {
          deptIdByName.set(d.name, `dry:${d.name}`);
        }
        report.counts.departments.created++;
      }
    }

    // 2) People.
    const userIdByEmail = new Map<string, string>();
    for (const p of people) {
      const email = p.email?.toLowerCase();
      if (!email) { report.warnings.push(`person with no email: ${p.name}`); continue; }
      const existing = await tx.user.findUnique({
        where: { tenantId_email: { tenantId: tenant.id, email } },
        select: { id: true },
      });
      if (existing) {
        userIdByEmail.set(email, existing.id);
        report.counts.people.skipped++;
        continue;
      }
      const roles = (p.roles || "Viewer").split("|").map((r) => r.trim()).filter(Boolean);
      const validRoles = roles.filter((r) => VALID_ROLES.has(r));
      if (validRoles.length === 0) { validRoles.push("Viewer"); report.warnings.push(`${email}: no valid role, defaulted to Viewer`); }
      const departmentId = p.department ? deptIdByName.get(p.department) ?? null : null;
      if (p.department && !departmentId) report.warnings.push(`${email}: department "${p.department}" not found`);
      const pw = tempPassword();
      if (execute) {
        const created = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email,
            name: p.name || email,
            status: "ACTIVE",
            passwordHash: await hashPassword(pw),
            departmentId,
          },
        });
        for (const role of validRoles) {
          await tx.roleAssignment.create({ data: { tenantId: tenant.id, userId: created.id, role } });
        }
        userIdByEmail.set(email, created.id);
      } else {
        userIdByEmail.set(email, `dry:${email}`);
      }
      report.tempCredentials.push({ email, tempPassword: pw });
      report.counts.people.created++;
    }

    // Second pass for manager links (needs all users present).
    if (execute) {
      for (const p of people) {
        const email = p.email?.toLowerCase();
        if (!email || !p.manager) continue;
        const uid = userIdByEmail.get(email);
        const mid = userIdByEmail.get(p.manager.toLowerCase());
        if (uid && mid && !uid.startsWith("dry:")) await tx.user.update({ where: { id: uid }, data: { managerId: mid } });
      }
    }

    // 3) Teams.
    for (const t of teams) {
      if (!t.name) continue;
      const existing = await tx.team.findFirst({ where: { name: t.name }, select: { id: true } });
      if (existing) { report.counts.teams.skipped++; continue; }
      const leadUserId = t.lead ? userIdByEmail.get(t.lead.toLowerCase()) ?? null : null;
      const memberEmails = (t.members || "").split("|").map((m) => m.trim().toLowerCase()).filter(Boolean);
      if (execute) {
        const created = await tx.team.create({
          data: {
            tenantId: tenant.id,
            name: t.name,
            description: t.description || null,
            leadUserId: leadUserId && !leadUserId.startsWith("dry:") ? leadUserId : null,
          },
        });
        for (const me of memberEmails) {
          const uid = userIdByEmail.get(me);
          if (uid && !uid.startsWith("dry:")) {
            await tx.teamMember.create({ data: { tenantId: tenant.id, teamId: created.id, userId: uid } });
          } else report.warnings.push(`team ${t.name}: member "${me}" not found`);
        }
      }
      report.counts.teams.created++;
    }

    // 4) Projects.
    const projectIdByCode = new Map<string, string>();
    for (const pr of projects) {
      if (!pr.code) continue;
      const existing = await tx.project.findFirst({ where: { code: pr.code }, select: { id: true } });
      if (existing) { projectIdByCode.set(pr.code, existing.id); report.counts.projects.skipped++; continue; }
      const leadUserId = pr.lead ? userIdByEmail.get(pr.lead.toLowerCase()) ?? null : null;
      if (execute) {
        const created = await tx.project.create({
          data: {
            tenantId: tenant.id,
            code: pr.code,
            name: pr.name || pr.code,
            description: pr.description || null,
            type: pr.type === "Programme" ? "Programme" : "Project",
            priority: pr.priority || "Medium",
            status: pr.status || "Planning",
            dueDate: pr.dueDate ? new Date(pr.dueDate) : null,
            budget: pr.budget || null,
            leadUserId: leadUserId && !leadUserId.startsWith("dry:") ? leadUserId : null,
          },
        });
        projectIdByCode.set(pr.code, created.id);
      } else {
        projectIdByCode.set(pr.code, `dry:${pr.code}`);
      }
      report.counts.projects.created++;
    }

    // 5) Allocations (resource assignments).
    for (const a of allocations) {
      const pid = projectIdByCode.get(a.projectCode);
      const uid = userIdByEmail.get((a.email || "").toLowerCase());
      if (!pid || !uid) { report.warnings.push(`allocation ${a.projectCode}/${a.email}: project or user not found`); continue; }
      if (execute && !pid.startsWith("dry:") && !uid.startsWith("dry:")) {
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: pid, userId: uid } },
          create: {
            tenantId: tenant.id,
            projectId: pid,
            userId: uid,
            role: a.role || "Contributor",
            allocationPct: a.allocationPct ? Number(a.allocationPct) : null,
          },
          update: { role: a.role || "Contributor", allocationPct: a.allocationPct ? Number(a.allocationPct) : null },
        });
      }
      report.counts.allocations.created++;
    }
  });

  // Output.
  console.log(`\n[import-riverbank] mode=${report.mode} tenant=${tenantSlug}`);
  for (const [k, v] of Object.entries(report.counts)) console.log(`  ${k}: ${v.created} created, ${v.skipped} skipped`);
  if (report.warnings.length) console.log(`  warnings: ${report.warnings.length}`);
  if (execute) {
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "import-report.json");
    writeFileSync(path, JSON.stringify(report, null, 2));
    console.log(`\n  Wrote ${path} (includes temp credentials — distribute securely, then delete).`);
  } else {
    console.log("\n  Dry run — no writes. Re-run with --execute to apply.");
    if (report.warnings.length) report.warnings.forEach((w) => console.log(`    ! ${w}`));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
