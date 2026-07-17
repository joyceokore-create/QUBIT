import { withTenant, type TenantContext } from "@/lib/tenant";
import { listProjects } from "@/server/projects";
import { getDashboardSummary, getUpcomingMilestones } from "@/server/dashboard";
import { listBlockers } from "@/server/blockers";
import { listRisks } from "@/server/risks";
import { listIssues } from "@/server/issues";
import { listWorkload } from "@/server/resources";
import { listUsers } from "@/server/users";
import { SectionCard, Rail, RailRow, Empty, StatTile, ProjectRow } from "@/components/dashboard/widgets";

// Per-role dashboard bodies (PROMPT §4). Each is a self-fetching async server component that
// composes the shared glass widgets, so the six dashboards are visibly different while reading
// as one system. HeadOfProjects + the default use the delivery ledger inline in the page.

const GLASS =
  "overflow-hidden rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";

const PM_PROJECT_ROLES = ["Project Manager"];

function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <section className={`grid grid-cols-2 md:grid-cols-4 ${GLASS} [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.1s_both]`} style={{ background: "var(--cardbg)" }}>
      {children}
    </section>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <section className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-2">{children}</section>;
}

// ── Executive — read-only portfolio view ────────────────────────────────────────
export async function ExecutiveBody({ ctx }: { ctx: TenantContext }) {
  const [summary, projects, blockers, milestones] = await Promise.all([
    getDashboardSummary(ctx),
    listProjects(ctx, {}),
    listBlockers(ctx, {}),
    getUpcomingMilestones(ctx, 8),
  ]);
  const atRisk = projects.filter((p) => p.status === "AtRisk" || p.status === "Overdue");
  const criticalBlockers = blockers.filter((b) => b.status === "Open" && b.severity === "Critical");

  return (
    <>
      <StatGrid>
        <StatTile label="Projects" value={summary.totalItems} tok="--qink" />
        <StatTile label="On track" value={summary.onTrack} tok="--ok" />
        <StatTile label="Needs attention" value={summary.atRisk + summary.overdue} tok="--bad" foot={`${summary.atRisk} at risk · ${summary.overdue} overdue`} />
        <StatTile label="Portfolio budget" value={summary.totalBudget} tok="--qink" />
      </StatGrid>
      <Grid2>
        <SectionCard title="Projects at risk" sub={`${atRisk.length}`} delay=".16s">
          {atRisk.length ? atRisk.map((p) => <ProjectRow key={p.id} id={p.id} code={p.code} name={p.name} status={p.status} right={<span className="font-mono text-[10.5px] tabular-nums text-[var(--ink3)]">{p.avgProgress}%</span>} />) : <Empty>Nothing at risk or overdue.</Empty>}
        </SectionCard>
        <div className="flex flex-col gap-3.5">
          <Rail title="Critical blockers" sub=" open" delay=".2s">
            {criticalBlockers.length ? criticalBlockers.map((b) => <RailRow key={b.id} tok="--bad" text={b.description} meta={`${b.projectCode ?? "—"} · critical`} glow href={`/projects/${b.projectId}`} />) : <Empty>No critical blockers.</Empty>}
          </Rail>
          <Rail title="Upcoming milestones" sub="next 30 days" delay=".24s">
            {milestones.length ? milestones.map((m) => <RailRow key={m.id} tok={m.color === "red" ? "--bad" : m.color === "amber" ? "--warn" : "--ok"} text={m.text} meta={m.meta} />) : <Empty>None scheduled.</Empty>}
          </Rail>
        </div>
      </Grid2>
    </>
  );
}

// ── Head of QA — quality governance ──────────────────────────────────────────────
export async function QaBody({ ctx }: { ctx: TenantContext }) {
  const [testTasks, issues, workload, milestones] = await Promise.all([
    withTenant(ctx, (tx) =>
      tx.projectTask.findMany({
        where: { OR: [{ phase: { contains: "Test", mode: "insensitive" } }, { phase: { contains: "UAT", mode: "insensitive" } }, { phase: { contains: "SIT", mode: "insensitive" } }] },
        select: { id: true, title: true, status: true, phase: true, projectId: true, project: { select: { code: true } } },
      }),
    ),
    listIssues(ctx, {}),
    listWorkload(ctx),
    getUpcomingMilestones(ctx, 8),
  ]);
  const byStatus = (s: string) => testTasks.filter((t) => t.status === s).length;
  const blocked = testTasks.filter((t) => t.status === "Blocked");
  const openHighIssues = issues.filter((i) => i.status !== "Closed" && (i.severity === "High" || i.severity === "Critical"));
  const uat = milestones.filter((m) => /uat|sit/i.test(m.text));

  return (
    <>
      <StatGrid>
        <StatTile label="In test" value={testTasks.length} tok="--qink" foot="Testing / UAT / SIT tasks" />
        <StatTile label="In progress" value={byStatus("InProgress")} tok="--warn" />
        <StatTile label="Blocked" value={byStatus("Blocked")} tok="--bad" />
        <StatTile label="Completed" value={byStatus("Completed")} tok="--ok" />
      </StatGrid>
      <Grid2>
        <SectionCard title="Blocked in test" sub={`${blocked.length}`} delay=".16s">
          {blocked.length ? blocked.map((t) => <RailRow key={t.id} tok="--bad" text={t.title} meta={`${t.project.code} · ${t.phase ?? "test"}`} glow href={`/projects/${t.projectId}`} />) : <Empty>Nothing blocked in test.</Empty>}
        </SectionCard>
        <div className="flex flex-col gap-3.5">
          <Rail title="Issues by severity" sub={`${openHighIssues.length} high/critical`} delay=".2s">
            {openHighIssues.length ? openHighIssues.map((i, n) => <RailRow key={n} tok={i.severity === "Critical" ? "--bad" : "--warn"} text={i.title} meta={`${i.projectCode ?? "—"} · ${i.severity}`} href="/risks" />) : <Empty>No high-severity issues.</Empty>}
          </Rail>
          <Rail title="Upcoming UAT/SIT" sub="milestones" delay=".24s">
            {uat.length ? uat.map((m) => <RailRow key={m.id} tok={m.color === "red" ? "--bad" : m.color === "amber" ? "--warn" : "--ok"} text={m.text} meta={m.meta} />) : <Empty>None scheduled.</Empty>}
          </Rail>
          <Rail title="QA team workload" sub="allocation" delay=".28s">
            {workload.some((w) => w.projectCount > 0) ? (
              workload.filter((w) => w.projectCount > 0).sort((a, b) => b.totalPct - a.totalPct).slice(0, 5).map((w) => (
                <RailRow key={w.userId} tok={w.totalPct > 100 ? "--bad" : "--ok"} text={w.name} meta={`${w.totalPct}% allocated`} />
              ))
            ) : (
              <Empty>No allocations yet.</Empty>
            )}
          </Rail>
        </div>
      </Grid2>
    </>
  );
}

// ── Project Manager — my projects ────────────────────────────────────────────────
export async function PmBody({ ctx }: { ctx: TenantContext }) {
  const { myProjectIds, tasksByStatus } = await withTenant(ctx, async (tx) => {
    const [led, pm] = await Promise.all([
      tx.project.findMany({ where: { leadUserId: ctx.userId }, select: { id: true } }),
      tx.projectMember.findMany({ where: { userId: ctx.userId, role: { in: PM_PROJECT_ROLES } }, select: { projectId: true } }),
    ]);
    const ids = [...new Set([...led.map((p) => p.id), ...pm.map((m) => m.projectId)])];
    const grouped = await tx.projectTask.groupBy({ by: ["status"], _count: { _all: true }, where: { projectId: { in: ids } } });
    return { myProjectIds: ids, tasksByStatus: grouped };
  });
  const [projects, risks, blockers, milestones] = await Promise.all([
    listProjects(ctx, {}),
    listRisks(ctx, {}),
    listBlockers(ctx, {}),
    getUpcomingMilestones(ctx, 8),
  ]);
  const mine = new Set(myProjectIds);
  const myProjects = projects.filter((p) => mine.has(p.id));
  const tc = (s: string) => tasksByStatus.find((t) => t.status === s)?._count._all ?? 0;
  const myOpenRisks = risks.filter((r) => r.status !== "Closed" && r.projectId != null && mine.has(r.projectId));
  const myOpenBlockers = blockers.filter((b) => b.status === "Open" && mine.has(b.projectId));

  return (
    <>
      <StatGrid>
        <StatTile label="My projects" value={myProjects.length} tok="--qink" />
        <StatTile label="Tasks in progress" value={tc("InProgress")} tok="--warn" />
        <StatTile label="Blocked" value={tc("Blocked")} tok="--bad" />
        <StatTile label="Completed" value={tc("Completed")} tok="--ok" />
      </StatGrid>
      <Grid2>
        <SectionCard title="My projects" sub={`${myProjects.length}`} delay=".16s">
          {myProjects.length ? myProjects.map((p) => <ProjectRow key={p.id} id={p.id} code={p.code} name={p.name} status={p.status} right={<span className="font-mono text-[10.5px] tabular-nums text-[var(--ink3)]">{p.avgProgress}%</span>} />) : <Empty>You don&apos;t lead any projects yet.</Empty>}
        </SectionCard>
        <div className="flex flex-col gap-3.5">
          <Rail title="My risks & blockers" sub={`${myOpenRisks.length + myOpenBlockers.length} open`} delay=".2s">
            {myOpenBlockers.map((b) => <RailRow key={b.id} tok={b.severity === "Critical" ? "--bad" : "--warn"} text={b.description} meta={`${b.projectCode ?? "—"} · blocker`} href={`/projects/${b.projectId}`} />)}
            {myOpenRisks.map((r, n) => <RailRow key={`r${n}`} tok="--warn" text={r.title} meta={`${r.projectCode ?? "—"} · risk`} href="/risks" />)}
            {myOpenRisks.length + myOpenBlockers.length === 0 && <Empty>Nothing open on your projects.</Empty>}
          </Rail>
          <Rail title="Upcoming milestones" sub="next 30 days" delay=".22s">
            {milestones.length ? milestones.slice(0, 6).map((m) => <RailRow key={m.id} tok={m.color === "red" ? "--bad" : m.color === "amber" ? "--warn" : "--ok"} text={m.text} meta={m.meta} />) : <Empty>None scheduled.</Empty>}
          </Rail>
          <Rail title="Pending join requests" sub="approvals" delay=".26s">
            <Empty>Join-request approvals arrive with the join flow (next phase).</Empty>
          </Rail>
        </div>
      </Grid2>
    </>
  );
}

// ── Platform Super Admin — directory + platform health ───────────────────────────
export async function AdminBody({ ctx }: { ctx: TenantContext }) {
  const [users, summary, ai, leadless] = await Promise.all([
    listUsers(ctx),
    getDashboardSummary(ctx),
    withTenant(ctx, async (tx) => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const [calls, tokens] = await Promise.all([
        tx.aiCallLog.count({ where: { createdAt: { gte: since } } }),
        tx.aiCallLog.aggregate({ where: { createdAt: { gte: since } }, _sum: { inputTokens: true, outputTokens: true } }),
      ]);
      return { calls, tokens: (tokens._sum.inputTokens ?? 0) + (tokens._sum.outputTokens ?? 0) };
    }),
    withTenant(ctx, (tx) => tx.project.findMany({ where: { OR: [{ leadUserId: null }, { dueDate: null }] }, select: { id: true, code: true, name: true, leadUserId: true, dueDate: true } })),
  ]);
  const active = users.filter((u) => u.status === "ACTIVE");
  const suspended = users.filter((u) => u.status === "SUSPENDED");
  const invited = active.filter((u) => u.lastLoginAt === null);
  const mfaPct = active.length ? Math.round((active.filter((u) => u.mfaEnabled).length / active.length) * 100) : 0;

  return (
    <>
      <StatGrid>
        <StatTile label="Active users" value={active.length} tok="--qink" foot={`${invited.length} invited, not signed in`} />
        <StatTile label="Suspended" value={suspended.length} tok="--warn" />
        <StatTile label="MFA adoption" value={`${mfaPct}%`} tok={mfaPct >= 80 ? "--ok" : "--warn"} />
        <StatTile label="Projects" value={summary.totalItems} tok="--qink" foot={summary.totalBudget} />
      </StatGrid>
      <Grid2>
        <SectionCard title="Data quality" sub={`${leadless.length} flags`} delay=".16s">
          {leadless.length ? leadless.map((p) => <RailRow key={p.id} tok="--warn" text={p.name} meta={`${p.code} · ${!p.leadUserId ? "no lead" : ""}${!p.leadUserId && !p.dueDate ? " · " : ""}${!p.dueDate ? "no due date" : ""}`} href={`/projects/${p.id}`} />) : <Empty>No data-quality flags.</Empty>}
        </SectionCard>
        <Rail title="AI usage today" sub="Q copilot" delay=".2s">
          <div className="grid grid-cols-2">
            <StatTile label="Calls" value={ai.calls} tok="--qink" />
            <StatTile label="Tokens" value={ai.tokens.toLocaleString()} tok="--qink" />
          </div>
        </Rail>
      </Grid2>
    </>
  );
}
