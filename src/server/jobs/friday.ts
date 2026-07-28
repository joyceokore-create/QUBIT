import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { isoWeekId } from "@/lib/iso-week";
import { computeCheckInDraft, effectiveRag, type CheckInDraft } from "@/server/checkins";
import { emitDomainEvent } from "@/server/events";
import { portfolioHealth } from "@/server/health";
import type { JobDefinition } from "@/server/jobs/types";

/**
 * The Friday loop (M2, docs/16-revamp-plan.md §7), two jobs on the box's crontab:
 *  - friday-checkin-drafts (Friday morning): persist a Draft check-in per active project
 *    and tell each lead their 2-minute confirm is ready.
 *  - friday-report (Friday afternoon): the weekly SharedReport — confirmed check-ins
 *    speak in the lead's voice; unconfirmed projects are marked "unconfirmed — computed
 *    status shown". Honest by default. Subscribers (ReportSubscription) get the link.
 */

const PM_PROJECT_ROLES = ["Project Manager"];
const ACTIVE_STATUSES = { notIn: ["Completed", "Cancelled"] };

export const fridayCheckinDrafts: JobDefinition = {
  name: "friday-checkin-drafts",
  async run(tx, tenant) {
    const now = new Date();
    const isoWeek = isoWeekId(now);
    const machineCtx = { tenantId: tenant.id, userId: "job:friday-checkin-drafts" };

    const projects = await tx.project.findMany({
      where: { status: ACTIVE_STATUSES },
      select: {
        id: true,
        name: true,
        leadUserId: true,
        members: { where: { role: { in: PM_PROJECT_ROLES } }, select: { userId: true } },
      },
    });

    let drafted = 0;
    let skippedConfirmed = 0;
    for (const p of projects) {
      const existing = await tx.checkIn.findUnique({
        where: { tenantId_projectId_isoWeek: { tenantId: tenant.id, projectId: p.id, isoWeek } },
        select: { id: true, status: true },
      });
      if (existing?.status === "Confirmed") {
        skippedConfirmed++;
        continue;
      }
      const { computedRag, draft } = await computeCheckInDraft(tx, p.id, now);
      const data = { computedRag, draft: draft as unknown as Prisma.InputJsonValue };
      const row = await tx.checkIn.upsert({
        where: { tenantId_projectId_isoWeek: { tenantId: tenant.id, projectId: p.id, isoWeek } },
        create: { tenantId: tenant.id, projectId: p.id, isoWeek, status: "Draft", ...data },
        update: data,
      });
      drafted++;

      const recipients = new Set<string>(p.members.map((m) => m.userId));
      if (p.leadUserId) recipients.add(p.leadUserId);
      await emitDomainEvent(tx, machineCtx, {
        type: "checkin.drafted",
        entityType: "check_in",
        entityId: row.id,
        payload: { projectId: p.id, isoWeek, rag: computedRag },
        notify: [...recipients].map((userId) => ({
          userId,
          kind: "checkin_ready",
          message: `Friday check-in for ${p.name} is drafted — review and confirm (≈2 min)`,
          link: `/projects/${p.id}`,
        })),
      });
    }
    return { isoWeek, drafted, skippedConfirmed };
  },
};

const RAG_DOT: Record<string, string> = { Green: "🟢", Amber: "🟡", Red: "🔴" };

export const fridayReport: JobDefinition = {
  name: "friday-report",
  async run(tx, tenant) {
    const now = new Date();
    const isoWeek = isoWeekId(now);
    const machineCtx = { tenantId: tenant.id, userId: "job:friday-report" };
    const title = `Weekly delivery report — ${isoWeek}`;

    // Idempotent beyond the JobRun key: one weekly report per tenant per ISO week.
    const already = await tx.sharedReport.findFirst({ where: { type: "weekly", title }, select: { id: true } });
    if (already) return { isoWeek, skipped: "report already published" };

    const [projects, checkIns, snapshots, milestonesAhead, escalations] = await Promise.all([
      tx.project.findMany({
        where: { status: ACTIVE_STATUSES },
        select: { id: true, code: true, name: true, status: true },
        orderBy: { name: "asc" },
      }),
      tx.checkIn.findMany({ where: { isoWeek }, include: { confirmedBy: { select: { name: true } } } }),
      tx.portfolioSnapshot.findMany({ orderBy: { day: "desc" }, take: 8 }),
      tx.projectMilestone.findMany({
        where: {
          status: { not: "Done" },
          dueDate: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) },
        },
        select: { name: true, dueDate: true, project: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
      // The exec digest section (M3): escalated nudges + at-risk milestones this week —
      // the matrix's "Executive weekly digest" escalation target lands here.
      tx.nudge.findMany({
        where: { isoWeek, OR: [{ escalationLevel: { gte: 1 } }, { signal: "milestone_at_risk" }] },
        orderBy: [{ escalationLevel: "desc" }, { sentAt: "asc" }],
        take: 8,
        select: { message: true, escalationLevel: true },
      }),
    ]);

    const byProject = new Map(checkIns.map((c) => [c.projectId, c]));
    const health = portfolioHealth(projects.map((p) => p.status));
    const latest = snapshots[0];
    const weekAgo = snapshots.find((s) => now.getTime() - s.day.getTime() >= 6 * 86_400_000);
    const delta = (pick: (s: (typeof snapshots)[number]) => number): string => {
      if (!latest || !weekAgo || latest.id === weekAgo.id) return "";
      const d = pick(latest) - pick(weekAgo);
      return d === 0 ? " (no change)" : ` (${d > 0 ? "+" : ""}${d} WoW)`;
    };

    const rows = projects.map((p) => {
      const ci = byProject.get(p.id);
      const confirmed = ci?.status === "Confirmed";
      const rag = ci ? effectiveRag(ci, now) : "Green";
      const overridden = !!(confirmed && ci?.ragOverride && ci.overrideExpiresAt && ci.overrideExpiresAt > now);
      const draft = (ci?.draft ?? { lines: [] }) as unknown as CheckInDraft;
      const factLine = (draft.lines ?? []).slice(0, 3).join("; ");
      if (confirmed && ci) {
        return `- ${RAG_DOT[rag]} **${p.name}** (${p.code})${overridden ? ` — _lead override: ${ci.overrideReason}_` : ""}\n  ${ci.narrative}${factLine ? `\n  _${factLine}_` : ""}`;
      }
      return `- ${RAG_DOT[ci?.computedRag ?? "Green"]} **${p.name}** (${p.code}) — ⚠️ _unconfirmed — computed status shown_${factLine ? `\n  ${factLine}` : ""}`;
    });

    const confirmedCount = checkIns.filter((c) => c.status === "Confirmed").length;
    const sorted = [...rows].sort((a, b) => {
      const rank = (s: string) => (s.includes("🔴") ? 0 : s.includes("🟡") ? 1 : 2);
      return rank(a) - rank(b);
    });

    const markdown = [
      `# ${tenant.slug.toUpperCase()} weekly delivery report — ${isoWeek}`,
      `\n## Portfolio`,
      `- **${health.total} active projects** · ${health.onTrack} on track · ${health.needAttention} need attention · ${health.planning} planning`,
      latest
        ? `- On-track ${latest.onTrackPct}%${delta((s) => s.onTrackPct)} · overdue tasks ${latest.tasksOverdue}${delta((s) => s.tasksOverdue)} · over-allocated ${latest.peopleOverAllocated}${delta((s) => s.peopleOverAllocated)}`
        : `- _No snapshot history yet — trends appear once nightly snapshots accrue._`,
      `- Check-ins confirmed: **${confirmedCount} of ${projects.length}**`,
      `\n## Escalations`,
      escalations.length
        ? escalations
            .map((e) => `- ${e.escalationLevel >= 2 ? "🔴" : e.escalationLevel === 1 ? "🟠" : "🟡"} ${e.message}`)
            .join("\n")
        : "_Nothing escalated this week._",
      `\n## Project check-ins`,
      sorted.length ? sorted.join("\n") : "_No active projects._",
      `\n## Due in the next 7 days`,
      milestonesAhead.length
        ? milestonesAhead
            .map((m) => `- ${m.project.name} — ${m.name} (${m.dueDate!.toLocaleDateString("en-GB", { day: "numeric", month: "short" })})`)
            .join("\n")
        : "_No milestones due._",
    ].join("\n");

    const token = randomBytes(32).toString("base64url");
    const report = await tx.sharedReport.create({
      data: {
        tenantId: tenant.id,
        token,
        type: "weekly",
        title,
        periodLabel: isoWeek,
        markdown,
        usedAi: false,
        createdById: null, // machine actor — no user row
      },
      select: { id: true },
    });

    const subscribers = await tx.reportSubscription.findMany({
      where: { kind: "weekly_report" },
      select: { userId: true },
    });
    await emitDomainEvent(tx, machineCtx, {
      type: "report.published",
      entityType: "shared_report",
      entityId: report.id,
      payload: { isoWeek, confirmed: confirmedCount, projects: projects.length },
      notify: subscribers.map((s) => ({
        userId: s.userId,
        kind: "weekly_report",
        message: `The ${isoWeek} weekly delivery report is out — ${confirmedCount}/${projects.length} check-ins confirmed`,
        link: `/reports/s/${token}`,
      })),
    });

    return { isoWeek, projects: projects.length, confirmed: confirmedCount, notified: subscribers.length };
  },
};
