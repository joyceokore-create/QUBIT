import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { isoWeekId, isValidIsoWeek } from "@/lib/iso-week";
import { canPreview, ownView, reportsHref, resolveReportsView, resolveTab, TABS, VIEW_LABEL, type ReportsView } from "@/lib/reports-view";
import { getReportsWeek } from "@/server/reports-week";
import { listRollups } from "@/server/portfolio-reports";
import { listShares } from "@/server/q/shares";
import { allowedDatasetKeys } from "@/server/custom-reports";
import { isSubscribed } from "@/server/report-subscriptions";
import { emailEnabled } from "@/server/mail/mailer";
import { ReportTabs } from "@/components/reports/report-tabs";
import { PreviewSwitch, WeekSwitcher } from "@/components/reports/week-switcher";
import { PmWeek } from "@/components/reports/pm-week";
import { StatusGrid } from "@/components/reports/status-grid";
import { HeadInbox } from "@/components/reports/head-inbox";
import { RollupRail } from "@/components/reports/rollup-rail";
import { RecentRollups, RollupArchive } from "@/components/reports/rollup-archive";
import { ExecWeek } from "@/components/reports/exec-week";
import { CustomReportBuilder } from "@/components/reports/custom-report-builder";
import { listRecipients } from "@/server/rollup-recipients";
import { pdfAvailable } from "@/server/pdf/render";

/**
 * Milestone B (docs handoff §3) — /reports, composed by role:
 *  - PM: their week (the My week queue, re-homed) · History · Custom reports;
 *  - Head: the inbox + roll-up rail · Past roll-ups · Custom reports;
 *  - Executive: the signed roll-up, 8-week status grid, tiles, decisions · Past weeks ·
 *    Custom reports.
 * The URL is the state: ?week= (any past week), ?tab=, and ?as= (Heads previewing another
 * role, read-only). /my-week redirects here; old ?tab= keys keep landing somewhere sane.
 */

const SUBTITLE: Record<ReportsView, (n: number) => string> = {
  pm: (n) =>
    n === 0
      ? "No projects to confirm this week — your work is reported from the board."
      : `Your ${n} ${n === 1 ? "project" : "projects"} this week. Confirm each line and it goes straight to the Head's roll-up.`,
  head: () => "Every project's update for the week, in one inbox. Approve the roll-up, then send or export it.",
  exec: () => "The approved weekly roll-up — status, trend and the blockers that need you.",
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ week?: string; as?: string; tab?: string; upload?: string }> }) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  const sp = await searchParams;

  const currentWeek = isoWeekId(new Date());
  const week = sp.week && isValidIsoWeek(sp.week) && sp.week <= currentWeek ? sp.week : currentWeek;
  const view = resolveReportsView(ctx.roles, sp.as);
  const previewing = view !== ownView(ctx.roles);
  const tab = resolveTab(view, sp.tab);
  const defaults = { week: currentWeek, view: ownView(ctx.roles) };
  const href = (p: { week?: string | null; as?: string | null; tab?: string | null }) => reportsHref({ week, as: previewing ? view : null, tab, ...p }, defaults);
  const isHead = can(ctx, "reports:read") && !previewing && view === "head";

  const data = await getReportsWeek(ctx, { isoWeek: week, view, previewing });
  const rowCount = data.kind === "pm" ? data.rows.length : 0;
  // Milestone D — exports + email: who the roll-up goes to, and whether this box can render PDFs.
  const [recipients, canPdf] = await Promise.all([can(ctx, "reports:read") ? listRecipients(ctx) : Promise.resolve([]), pdfAvailable()]);

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 p-[22px_24px_90px]">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3.5 [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
        <div className="min-w-0 flex-[1_1_420px]">
          <h1 className="font-heading text-[26px] rv:text-heading-lg font-bold tracking-[-.7px] text-[var(--qink)]">Reports</h1>
          <p className="mt-1 text-[13.5px] text-[var(--ink3)] [text-wrap:pretty]">
            {SUBTITLE[view](rowCount)}
            {previewing && <span className="text-[var(--ink5)]"> · Previewing as {VIEW_LABEL[view]}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <WeekSwitcher isoWeek={week} range={data.week.range} prev={data.week.prev} next={data.week.next} currentWeek={currentWeek} hrefFor={(w) => href({ week: w })} />
          {canPreview(ctx.roles) && <PreviewSwitch view={view} hrefFor={(v) => href({ as: v, tab: tab === "custom" ? "custom" : "week" })} />}
        </div>
      </div>

      <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.06s_both]">
        <ReportTabs tabs={TABS[view]} active={tab} hrefFor={(k) => href({ tab: k })} />
      </div>

      <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.1s_both]">
        {tab === "custom" ? (
          <CustomReportBuilder allowedDatasets={allowedDatasetKeys(ctx)} pdfAvailable={canPdf} />
        ) : data.kind === "pm" ? (
          tab === "history" ? (
            <StatusGrid
              weeks={data.grid.length ? data.grid[0]!.rows[0]!.cells.map((c) => c.isoWeek) : []}
              groups={data.grid}
              hrefFor={(id) => `/projects/${id}?tab=This%20week`}
              title="Your projects · last 8 weeks"
              emptyCopy="No confirmed status updates yet — this week's will be the first."
            />
          ) : (
            <PmWeek isoWeek={week} isCurrent={data.week.isCurrent} canUpload={!previewing} openUploadOnLoad={sp.upload === "1" && !previewing && data.week.isCurrent} rows={data.rows.map((r) => ({ ...r, sentAt: r.sentAt?.toISOString() ?? null }))} />
          )
        ) : data.kind === "head" ? (
          tab === "rollups" ? (
            <ArchiveTab ctx={ctx} isHead={isHead} hrefForWeek={(w) => href({ week: w, tab: "week" })} />
          ) : (
            <div className="flex flex-wrap items-start gap-5">
              <HeadInbox
                isoWeek={week}
                isCurrent={data.week.isCurrent}
                canNudge={data.can.nudge}
                header={data.header}
                groups={data.groups.map((g) => ({
                  portfolioName: g.portfolioName,
                  in: g.in,
                  total: g.total,
                  rows: g.rows.map((r) => ({ ...r, sentAt: r.sentAt?.toISOString() ?? null })),
                }))}
              />
              <aside className="flex flex-[1_1_300px] flex-col gap-4">
                <RollupRail
                  isoWeek={week}
                  isCurrent={data.week.isCurrent}
                  canApprove={data.can.approve}
                  rollup={{
                    status: data.rollup.status,
                    narrative: data.rollup.narrative,
                    approvedByName: data.rollup.approvedByName,
                    approvedAt: data.rollup.approvedAt?.toISOString() ?? null,
                    total: data.rollup.total,
                    ragCounts: data.rollup.ragCounts,
                    emailedAt: data.rollup.emailedAt?.toISOString() ?? null,
                    emailedCount: data.rollup.emailedCount,
                  }}
                  exports={{ recipients, canEditRecipients: isHead, emailEnabled: emailEnabled(), pdfAvailable: canPdf }}
                />
                <RecentRollups rows={await listRollups(ctx, 6)} isoWeek={week} hrefForWeek={(w) => href({ week: w, tab: "week" })} archiveHref={href({ tab: "rollups" })} />
              </aside>
            </div>
          )
        ) : tab === "past" ? (
          <ArchiveTab ctx={ctx} isHead={false} hrefForWeek={(w) => href({ week: w, tab: "week" })} />
        ) : (
          <ExecWeek data={data} week={data.week} subscribed={await isSubscribed(ctx)} emailEnabled={emailEnabled()} pdfAvailable={canPdf} />
        )}
      </div>
    </main>
  );
}

async function ArchiveTab({
  ctx,
  isHead,
  hrefForWeek,
}: {
  ctx: { tenantId: string; userId: string; roles: string[]; permissions?: string[] };
  isHead: boolean;
  hrefForWeek: (w: string) => string;
}) {
  const [rows, shares] = await Promise.all([listRollups(ctx), listShares(ctx)]);
  return (
    <RollupArchive
      rows={rows}
      shares={shares.filter((s) => s.type === "weekly").map((s) => ({ token: s.token, title: s.title, createdAt: s.createdAt }))}
      showExports={can(ctx, "reports:read")}
      isHead={isHead}
      hrefForWeek={hrefForWeek}
    />
  );
}
