import "server-only";
import { audit } from "@/lib/audit";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { ownView } from "@/lib/reports-view";
import { runsProjectWhere } from "@/lib/ownership";
import { getProjectSetup } from "@/server/project-setup";

/**
 * First-week walkthrough — who gets it offered, and the one flag that stops it coming
 * back. The tour is for people who RUN projects (lead or "Project Manager" member) or hold
 * the ProjectManager role; executives and plain members are never interrupted by it.
 * Finishing or exiting stamps `tourCompletedAt`; "Show me around" replays without
 * touching the stamp. Super admins who run a project are offered it too (the seeded
 * admins the e2e smoke signs in as are stamped by the seed, so they are never interrupted).
 */

export interface TourProjectSetup {
  id: string;
  code: string;
  name: string;
  done: number;
  total: number;
  /** The set-up walk skips what is already done; youtrack null = feature off (skipped too). */
  items: { gates: boolean; documents: boolean; team: boolean; youtrack: boolean | null; thisWeek: boolean };
}

export interface TourOffer {
  offer: boolean;
  /** Can replay from the menu: runs projects or is a PM. */
  eligible: boolean;
  firstProjectId: string | null;
  projectCount: number;
  /** The projects the viewer runs, with their setup progress — the welcome takeover and
   *  the header nudge read this. Capped at 12. */
  projects: TourProjectSetup[];
  /** The /reports the walk ends on: a PM's own queue, or the PM preview for Heads/admins. */
  reportsQuery: string;
  /** The /dashboard the app walk starts on: a PM's own cockpit, or the PM preview for Heads/admins. */
  dashboardQuery: string;
  /** The app walk has been finished or dismissed before (the server stamp). */
  appDone: boolean;
}

export async function shouldOfferTour(ctx: TenantContext, now = new Date()): Promise<TourOffer> {
  return withTenant(ctx, async (tx) => {
    const [user, projects] = await Promise.all([
      tx.user.findUnique({ where: { id: ctx.userId }, select: { tourCompletedAt: true } }),
      tx.project.findMany({
        where: {
          status: { notIn: ["Completed", "Cancelled"] },
          ...runsProjectWhere(ctx.userId),
        },
        select: { id: true, code: true, name: true },
        orderBy: { createdAt: "asc" },
        take: 50,
      }),
    ]);
    const setups = await Promise.all(
      projects.slice(0, 12).map(async (p) => {
        const s = await getProjectSetup(ctx, p.id, now);
        return { id: p.id, code: p.code, name: p.name, done: s.done, total: s.total, items: { gates: s.gates, documents: s.documents, team: s.team, youtrack: s.youtrack, thisWeek: s.thisWeek } };
      }),
    );
    const superAdmin = ctx.roles.includes("PlatformSuperAdmin");
    const head = ctx.roles.includes("HeadOfProjects");
    // Runs projects / is a PM → offered once. Super admins and Heads can always replay the
    // walk (to see what their PMs see), on the first active project when they run none.
    const eligible = projects.length > 0 || ctx.roles.includes("ProjectManager") || superAdmin || head;
    let firstProjectId: string | null = projects[0]?.id ?? null;
    if (!firstProjectId && (superAdmin || head)) {
      const any = await tx.project.findFirst({ where: { status: { notIn: ["Completed", "Cancelled"] } }, select: { id: true }, orderBy: { createdAt: "asc" } });
      firstProjectId = any?.id ?? null;
    }
    return {
      // Offered once to PMs, and to anyone (admins included) who actually runs a project.
      offer: (projects.length > 0 || ctx.roles.includes("ProjectManager")) && !user?.tourCompletedAt,
      eligible,
      firstProjectId,
      projectCount: projects.length,
      projects: setups,
      reportsQuery: ownView(ctx.roles) === "pm" ? "" : "?as=pm",
      dashboardQuery: ownView(ctx.roles) === "pm" ? "" : "?level=pm",
      appDone: Boolean(user?.tourCompletedAt),
    };
  });
}

export async function completeTour(ctx: TenantContext, now = new Date()): Promise<{ tourCompletedAt: Date }> {
  await withTenant(ctx, async (tx) => {
    const { count } = await tx.user.updateMany({ where: { id: ctx.userId, tourCompletedAt: null }, data: { tourCompletedAt: now } });
    if (count > 0) await audit(tx, ctx, { action: "update", entityType: "user", entityId: ctx.userId, after: { tourCompletedAt: now } });
  });
  return { tourCompletedAt: now };
}

export async function resetTour(ctx: TenantContext): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const { count } = await tx.user.updateMany({ where: { id: ctx.userId, tourCompletedAt: { not: null } }, data: { tourCompletedAt: null } });
    if (count > 0) await audit(tx, ctx, { action: "update", entityType: "user", entityId: ctx.userId, after: { tourCompletedAt: null } });
  });
}
