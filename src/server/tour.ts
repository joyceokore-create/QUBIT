import "server-only";
import { audit } from "@/lib/audit";
import { withTenant, type TenantContext } from "@/lib/tenant";

/**
 * First-week walkthrough — who gets it offered, and the one flag that stops it coming
 * back. The tour is for people who RUN projects (lead or "Project Manager" member) or hold
 * the ProjectManager role; executives and plain members are never interrupted by it.
 * Finishing or exiting stamps `tourCompletedAt`; "Show me around" replays without
 * touching the stamp. Super admins are eligible to replay but never auto-interrupted —
 * they are not the PM audience, and the e2e smoke signs in as one.
 */

export interface TourOffer {
  offer: boolean;
  /** Can replay from the menu: runs projects or is a PM. */
  eligible: boolean;
  firstProjectId: string | null;
  projectCount: number;
}

export async function shouldOfferTour(ctx: TenantContext): Promise<TourOffer> {
  return withTenant(ctx, async (tx) => {
    const [user, projects] = await Promise.all([
      tx.user.findUnique({ where: { id: ctx.userId }, select: { tourCompletedAt: true } }),
      tx.project.findMany({
        where: {
          status: { notIn: ["Completed", "Cancelled"] },
          OR: [{ leadUserId: ctx.userId }, { members: { some: { userId: ctx.userId, role: "Project Manager" } } }],
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: 50,
      }),
    ]);
    const eligible = projects.length > 0 || ctx.roles.includes("ProjectManager");
    const superAdmin = ctx.roles.includes("PlatformSuperAdmin");
    return {
      offer: eligible && !superAdmin && !user?.tourCompletedAt,
      eligible,
      firstProjectId: projects[0]?.id ?? null,
      projectCount: projects.length,
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
