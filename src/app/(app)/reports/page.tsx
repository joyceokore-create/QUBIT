import { PageHeader } from "@/components/list/page-header";
import { PastUpdates } from "@/components/reports/past-updates";
import { listMyPastUpdates } from "@/server/past-updates";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { isoWeekId, isValidIsoWeek } from "@/lib/iso-week";
import { MY_DATASET_KEYS } from "@/lib/report-catalogue";
import { canPreview, CUSTOM_ONLY_TABS, customReportsOnly, ownView, reportsHref, resolveReportsView, resolveTab, showsQualityTab, tabsFor, VIEW_LABEL, type ReportsView } from "@/lib/reports-view";
import { getReportsWeek } from "@/server/reports-week";
import { getTenantTimeZone, getViewState } from "@/server/preferences";
import { isPreviewing, VIEW_ROLE_REPORTS } from "@/lib/view-roles";
import { listRollups } from "@/server/portfolio-reports";
import { listShares } from "@/server/q/shares";
import { offeredDatasetKeys } from "@/server/custom-reports";
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
import { QualityReport } from "@/components/reports/quality-report";
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
 *
 * UX6 (D13) — a viewer WITHOUT reports:read (a Member) gets Custom reports only, offering
 * just My tasks · My projects · Blockers I raised. That branch returns before any weekly
 * loader (getReportsWeek, recipients, roll-ups) runs, whatever ?tab= / ?as= / ?week= say.
 *
 * UX9 (D13) — a Head of QA reading the Executive view (classic layout, or the new layout
 * "Viewing as" Head of QA) also gets a Quality tab: This week · Past weeks · Quality · Custom
 * reports. It reads "now", so the week switcher steps aside on that tab.
 */

const SUBTITLE: Record<ReportsView, (n: number) => string> = {
  pm: (n) =>
    n === 0
      ? "No projects to confirm this week — your work is reported from the board."
      : `Your ${n} ${n === 1 ? "project" : "projects"} this week. Confirm each line and it goes straight to the Head's roll-up.`,
  head: () => "Every project's update for the week, in one inbox. Approve the roll-up, then send or export it.",
  exec: () => "The approved weekly roll-up — status, trend and the blockers that need you.",
};

const QUALITY_SUBTITLE = "Quality across every active project — test coverage, critical issues and test work.";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ week?: string; as?: string; tab?: string; upload?: string }> }) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  const sp = await searchParams;
  // The walkthrough's "update all at once" door moved to its own page.
  if (sp.upload === "1") redirect("/reports/update?upload=1");

  // UX6 (D13): Member → Custom reports only. That's everyone without reports:read, and in the
  // new layout anyone "Viewing as" Member (presentation only: it offers just the My datasets
  // and never widens what the API allows). A ?as= deep link keeps the old preview behaviour.
  const viewState = await getViewState(ctx);
  const memberLayout = viewState.uiMode === "new" && viewState.viewRole === "Member" && !sp.as;
  if (customReportsOnly(ctx) || memberLayout) {
    const [canPdf, timeZone] = await Promise.all([pdfAvailable(), getTenantTimeZone(ctx)]);
    const offered = offeredDatasetKeys(ctx).filter((k) => !memberLayout || (MY_DATASET_KEYS as readonly string[]).includes(k));
    return (
      <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 p-[22px_24px_90px]">
        <CustomReportBuilder
          allowedDatasets={offered}
          pdfAvailable={canPdf}
          timeZone={timeZone}
          viewRole="Member"
          description="Build a report from your work."
          tabs={<ReportTabs tabs={CUSTOM_ONLY_TABS} active="custom" hrefFor={() => "/reports"} />}
        />
      </main>
    );
  }

  const currentWeek = isoWeekId(new Date());
  const week = sp.week && isValidIsoWeek(sp.week) && sp.week <= currentWeek ? sp.week : currentWeek;
  // UX3 (D2a): in the new layout "Viewing as" picks the view, and the in-page preview
  // switch goes. A ?as= deep link (the product tour) still works for those who may preview.
  const newUi = viewState.uiMode === "new";
  const asDeepLink = Boolean(sp.as) && canPreview(ctx.roles);
  const view: ReportsView = newUi && !asDeepLink ? VIEW_ROLE_REPORTS[viewState.viewRole] : resolveReportsView(ctx.roles, sp.as);
  // Previewing = read-only: a role the person doesn't hold (Super Admin's preview, a Head's ?as=).
  const previewing = newUi && !asDeepLink ? isPreviewing(ctx.roles, viewState.viewRole) : view !== ownView(ctx.roles);
  // UX9: Head of QA's Quality tab (real roles + reports:read; the layout only decides when).
  const tabOpts = { quality: showsQualityTab(ctx, viewState) };
  const tab = resolveTab(view, sp.tab, tabOpts);
  const defaults = { week: currentWeek, view: newUi && !asDeepLink ? view : ownView(ctx.roles) };
  const href = (p: { week?: string | null; as?: string | null; tab?: string | null }) =>
    reportsHref({ week, as: previewing && (!newUi || asDeepLink) ? view : null, tab, ...p }, defaults);
  const isHead = can(ctx, "reports:read") && !previewing && view === "head";

  // UX fidelity Tier 3: Custom Reports draws its own header (Export CSV / Export PDF) and
  // the three-card builder; no week switcher (the data isn't weekly).
  if (tab === "custom") {
    const [canPdf, timeZone] = await Promise.all([pdfAvailable(), getTenantTimeZone(ctx)]);
    return (
      <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 p-[22px_24px_90px]">
        <CustomReportBuilder
          allowedDatasets={offeredDatasetKeys(ctx)}
          pdfAvailable={canPdf}
          timeZone={timeZone}
          viewRole={newUi ? viewState.viewRole : null}
          tabs={<ReportTabs tabs={tabsFor(view, tabOpts)} active={tab} hrefFor={(k) => href({ tab: k })} />}
        />
      </main>
    );
  }

  const data = await getReportsWeek(ctx, { isoWeek: week, view, previewing });
  const rowCount = data.kind === "pm" ? data.rows.length : 0;
  // Milestone D — exports + email: who the roll-up goes to, and whether this box can render PDFs.
  const [recipients, canPdf] = await Promise.all([
    can(ctx, "reports:read") ? listRecipients(ctx) : Promise.resolve([]),
    pdfAvailable(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 p-[22px_24px_90px]">
      {/* UX12 (D13, L2): the shared page header — title, one-line description, actions top right. */}
      <PageHeader
        title="Reports"
        description={
          <>
            {tab === "quality" ? QUALITY_SUBTITLE : SUBTITLE[view](rowCount)}
            {previewing && <span> · Previewing as {VIEW_LABEL[view]}</span>}
          </>
        }
        actions={
          <>
            {tab !== "quality" && <WeekSwitcher isoWeek={week} range={data.week.range} prev={data.week.prev} next={data.week.next} currentWeek={currentWeek} hrefFor={(w) => href({ week: w })} />}
            {!newUi && canPreview(ctx.roles) && <PreviewSwitch view={view} hrefFor={(v) => href({ as: v, tab: tab === "custom" ? "custom" : "week" })} />}
          </>
        }
      />

      <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.06s_both]">
        <ReportTabs tabs={tabsFor(view, tabOpts)} active={tab} hrefFor={(k) => href({ tab: k })} />
      </div>

      <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.1s_both]">
        {tab === "quality" ? (
          <QualityReport ctx={ctx} />
        ) : data.kind === "pm" ? (
          tab === "history" ? (
            <div className="flex flex-col gap-6">
              <StatusGrid
                weeks={data.grid.length ? data.grid[0]!.rows[0]!.cells.map((c) => c.isoWeek) : []}
                groups={data.grid}
                hrefFor={(id) => `/projects/${id}?tab=This%20week`}
                title="Your projects · last 8 weeks"
                emptyCopy="No confirmed status updates yet — this week's will be the first."
              />
              {/* UX12 (D13): History = status over 8 weeks PLUS past updates. */}
              <PastUpdatesSection ctx={ctx} />
            </div>
          ) : (
            <PmWeek isoWeek={week} isCurrent={data.week.isCurrent} canUpload={!previewing} rows={data.rows.map((r) => ({ ...r, sentAt: r.sentAt?.toISOString() ?? null }))} />
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
                canUpload={!previewing}
               
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
  const [rows, shares, timeZone] = await Promise.all([listRollups(ctx), listShares(ctx), getTenantTimeZone(ctx)]);
  return (
    <RollupArchive
      timeZone={timeZone}
      rows={rows}
      shares={shares.filter((s) => s.type === "weekly").map((s) => ({ token: s.token, title: s.title, createdAt: s.createdAt }))}
      showExports={can(ctx, "reports:read")}
      isHead={isHead}
      hrefForWeek={hrefForWeek}
    />
  );
}

/** UX12 (D13): the PM's past updates, read under RLS (projects they run). */
async function PastUpdatesSection({ ctx }: { ctx: { tenantId: string; userId: string; roles: string[]; permissions?: string[] } }) {
  const [rows, timeZone] = await Promise.all([listMyPastUpdates(ctx), getTenantTimeZone(ctx)]);
  return <PastUpdates rows={rows} timeZone={timeZone} />;
}
