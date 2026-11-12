// Bulk people import (Admin → Users). This is the one piece of the retired org-setup
// wizard worth keeping: QUBIT serves a single tenant whose brand, markets and templates
// are settled, but onboarding a batch of people from an HR or YouTrack export stays a
// real recurring job. See DM1.72.
//
// PM onboarding (Oct 2026): the file is a re-runnable template. A row whose email already
// exists is UPDATED (its project assignments applied; roles untouched) rather than failed,
// and each row's `projects` codes become "Project Manager" memberships — the first PM a
// lead-less project gets also becomes its lead, because the inbox, the digest and the PDF
// header all read `Project.lead`. A failing row becomes an error RESULT, never an aborted
// batch — one bad address must not cost the other forty.
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { emitDomainEvent } from "@/server/events";
import { createUser } from "@/server/users";
import type { PeopleRow } from "@/lib/people-csv";
import type { UserGroup } from "@/lib/personas";

export class PeopleImportError extends Error {
  code: string;
  constructor(message: string, code = "PEOPLE_IMPORT_ERROR") {
    super(message);
    this.code = code;
  }
}

export interface ImportRowResult {
  email: string;
  /** invited = created, link minted (SSO off) · active = created, signs in with Microsoft
   *  (SSO on) · updated = already existed, assignments applied · error = nothing done. */
  status: "invited" | "active" | "updated" | "error";
  message?: string;
  /** Present only while email is unconfigured — the admin copies it instead. */
  acceptUrl?: string;
  /** Project codes the person was assigned to (as "Project Manager" / "Stakeholder"). */
  assigned: string[];
  /** …and of which they became the lead (the project had none). */
  leadOf: string[];
  /** Codes in the file that match no project in this tenant. */
  unknownProjects: string[];
}

/** Dry run — what the import WOULD do, with nothing written. */
export interface ImportRowPreview {
  line: number;
  name: string;
  email: string;
  role: string;
  exists: boolean;
  projectsFound: string[];
  unknownProjects: string[];
}

/** Inviting people is `users:invite`; minting a Super Admin is separately guarded inside
 * createUser, so an importer cannot escalate through a CSV column. */
function assertMayInvite(ctx: TenantContext): void {
  if (!can(ctx, "users:invite")) {
    throw new PeopleImportError("You cannot invite people.", "FORBIDDEN");
  }
}

/** The hat an imported person wears on their projects. Heads who also run projects are PMs there. */
function projectRoleFor(systemRole: string): "Project Manager" | "Stakeholder" {
  return systemRole === "ProjectManager" || systemRole === "HeadOfProjects" || systemRole === "PlatformSuperAdmin" ? "Project Manager" : "Stakeholder";
}

async function projectsByCode(ctx: TenantContext, codes: string[]): Promise<Map<string, { id: string; name: string; leadUserId: string | null }>> {
  if (!codes.length) return new Map();
  const rows = await withTenant(ctx, (tx) =>
    tx.project.findMany({ where: { code: { in: codes } }, select: { id: true, code: true, name: true, leadUserId: true } }),
  );
  return new Map(rows.map((p) => [p.code.toUpperCase(), { id: p.id, name: p.name, leadUserId: p.leadUserId }]));
}

export async function previewImport(ctx: TenantContext, rows: PeopleRow[]): Promise<ImportRowPreview[]> {
  assertMayInvite(ctx);
  const codes = [...new Set(rows.flatMap((r) => r.projects))];
  const [projects, existing] = await Promise.all([
    projectsByCode(ctx, codes),
    withTenant(ctx, (tx) => tx.user.findMany({ where: { email: { in: rows.map((r) => r.email) }, status: { not: "DELETED" } }, select: { email: true } })),
  ]);
  const taken = new Set(existing.map((u) => u.email.toLowerCase()));
  return rows.map((r) => ({
    line: r.line,
    name: r.name,
    email: r.email,
    role: r.role,
    exists: taken.has(r.email),
    projectsFound: r.projects.filter((c) => projects.has(c)),
    unknownProjects: r.projects.filter((c) => !projects.has(c)),
  }));
}

/** Assign one person to the row's projects inside one transaction. Returns what changed. */
async function assignProjects(
  ctx: TenantContext,
  userId: string,
  role: "Project Manager" | "Stakeholder",
  codes: string[],
  projects: Map<string, { id: string; name: string; leadUserId: string | null }>,
): Promise<{ assigned: string[]; leadOf: string[] }> {
  const assigned: string[] = [];
  const leadOf: string[] = [];
  if (!codes.length) return { assigned, leadOf };
  await withTenant(ctx, async (tx) => {
    for (const code of codes) {
      const p = projects.get(code);
      if (!p) continue;
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: p.id, userId } },
        create: { tenantId: ctx.tenantId, projectId: p.id, userId, role },
        update: { role },
      });
      let becameLead = false;
      if (role === "Project Manager" && !p.leadUserId) {
        await tx.project.update({ where: { id: p.id }, data: { leadUserId: userId } });
        p.leadUserId = userId; // the next PM in the same file does not also become lead
        becameLead = true;
        leadOf.push(code);
      }
      assigned.push(code);
      await audit(tx, ctx, {
        action: "update",
        entityType: "project",
        entityId: p.id,
        after: { imported: { userId, role, lead: becameLead } },
      });
      await emitDomainEvent(tx, ctx, {
        type: "project.members_assigned",
        entityType: "project",
        entityId: p.id,
        payload: { count: 1, source: "people-import" },
        notify:
          userId === ctx.userId
            ? []
            : [{ userId, kind: "project.assigned", message: `You were assigned to ${p.name} as ${role}.`, link: `/projects/${p.id}` }],
      });
    }
  });
  return { assigned, leadOf };
}

export async function importPeople(ctx: TenantContext, rows: PeopleRow[]): Promise<ImportRowResult[]> {
  assertMayInvite(ctx);
  // Assigning is a project write — an inviter without it still imports, just not onto projects.
  const mayAssign = can(ctx, "project:update");
  const codes = [...new Set(rows.flatMap((r) => r.projects))];
  const projects = await projectsByCode(ctx, codes);
  const results: ImportRowResult[] = [];
  for (const row of rows) {
    const unknownProjects = row.projects.filter((c) => !projects.has(c));
    const wanted = mayAssign ? row.projects.filter((c) => projects.has(c)) : [];
    try {
      const existing = await withTenant(ctx, (tx) =>
        tx.user.findFirst({ where: { email: { equals: row.email, mode: "insensitive" }, status: { not: "DELETED" } }, select: { id: true } }),
      );
      let userId: string;
      let status: ImportRowResult["status"];
      let acceptUrl: string | undefined;
      if (existing) {
        userId = existing.id;
        status = "updated";
      } else {
        const created = await createUser(ctx, {
          name: row.name,
          email: row.email,
          roles: [row.role],
          userGroups: row.group ? [row.group as UserGroup] : undefined,
        });
        userId = created.user.id;
        status = created.sso ? "active" : "invited";
        acceptUrl = created.acceptUrl;
      }
      const { assigned, leadOf } = await assignProjects(ctx, userId, projectRoleFor(row.role), wanted, projects);
      results.push({
        email: row.email,
        status,
        ...(acceptUrl ? { acceptUrl } : {}),
        assigned,
        leadOf,
        unknownProjects,
        ...(row.projects.length && !mayAssign ? { message: "Imported, but you cannot assign projects (needs project:update)." } : {}),
      });
    } catch (e) {
      results.push({
        email: row.email,
        status: "error",
        message: e instanceof Error ? e.message : "Could not import.",
        assigned: [],
        leadOf: [],
        unknownProjects,
      });
    }
  }
  return results;
}
