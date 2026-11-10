import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { withTenant } from "@/lib/tenant";
import { listWorkload } from "@/server/resources";
import { listResourceRequests } from "@/server/staffing";
import { getTenantTimeZone } from "@/server/preferences";
import { ExportButton } from "@/components/export-button";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/list/page-header";
import { TabStrip } from "@/components/ui/tab-strip";
import { PeopleDirectory } from "@/components/people/people-directory";
import { RecordLeaveDialog } from "@/components/people/record-leave-dialog";
import { StaffingClient } from "../staffing/staffing-client";

type TabKey = "directory" | "requests";

// DM1.73 — People + Staffing merged into one page: tab "Directory" (workload table)
// and tab "Staffing requests" (the former /staffing surface, gated on project:create).
// The directory doubles as the data behind the Q copilot's per-resource report
// (MVP1 Phase B).
//
// UX5 (L1–L5): shared header (Record leave + Export top right), U1 tabs, and the
// Directory as a browser-paged list with search and Department · Team · Workload filters.
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "project:read")) return <Forbidden />;

  // The staffing actors: anyone who can create projects (PMs, Heads). Members
  // never see the chip — People itself is memberHidden, PMs are not memberOnly.
  const canStaffTab = can(ctx, "project:create");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "directory", label: "Directory" },
    ...(canStaffTab ? [{ key: "requests" as const, label: "Staffing requests" }] : []),
  ];
  const { tab: requested } = await searchParams;
  const tab: TabKey = tabs.some((t) => t.key === requested) ? (requested as TabKey) : "directory";

  // DM1.73 (Wave D) — manual leave entry. Rendered only for viewers POST /api/absences
  // would actually accept (iam:manage — people admins — or project:update — PMs), the
  // exact gate the route enforces, so the button never leads to a 403.
  const canRecordLeave = can(ctx, "iam:manage") || can(ctx, "project:update");
  const leavePeople =
    tab === "directory" && canRecordLeave
      ? await withTenant(ctx, (tx) =>
          tx.user.findMany({
            where: { status: { not: "DELETED" } },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
        )
      : [];

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <PageHeader
        eyebrow={session.user.tenantName}
        title="People"
        description={
          tab === "requests"
            ? "Resource requests — ask for a shape; the Head fills it from the bench."
            : "Resource allocation across projects. Allocation is leave-aware over the next fortnight."
        }
        actions={
          tab === "directory" && (
            <>
              {canRecordLeave && <RecordLeaveDialog people={leavePeople} />}
              <ExportButton href="/api/export?kind=allocations" />
            </>
          )
        }
      />

      {tabs.length > 1 && (
        <TabStrip
          label="People views"
          active={tab}
          tabs={tabs.map((t) => ({ key: t.key, label: t.label, href: t.key === "directory" ? "/people" : `/people?tab=${t.key}` }))}
        />
      )}

      {tab === "directory" ? <DirectoryTab ctx={ctx} /> : <RequestsTab ctx={ctx} />}
    </main>
  );
}

type Ctx = { tenantId: string; userId: string; roles: string[]; permissions?: string[] };

/** The workload directory. Team names come from one RLS-scoped read of team memberships
 * (listWorkload stays as it is — it feeds exports, Q and the Brief too). */
async function DirectoryTab({ ctx }: { ctx: Ctx }) {
  const [people, memberships, timeZone] = await Promise.all([
    listWorkload(ctx),
    withTenant(ctx, (tx) => tx.teamMember.findMany({ select: { userId: true, team: { select: { name: true } } } })),
    getTenantTimeZone(ctx),
  ]);
  const teamsByUser = new Map<string, string[]>();
  for (const m of memberships) {
    const list = teamsByUser.get(m.userId) ?? [];
    list.push(m.team.name);
    teamsByUser.set(m.userId, list);
  }

  return (
    <PeopleDirectory
      timeZone={timeZone}
      people={people.map((p) => ({
        userId: p.userId,
        name: p.name,
        email: p.email,
        departmentName: p.departmentName,
        teams: (teamsByUser.get(p.userId) ?? []).sort((a, b) => a.localeCompare(b)),
        totalPct: p.totalPct,
        effectivePct: p.effectivePct,
        onLeaveUntil: p.onLeaveUntil ? p.onLeaveUntil.toISOString() : null,
        allocations: p.allocations,
      }))}
    />
  );
}

/** M-P1d (docs/26 §4.3), relocated here by DM1.73 — resource requests. A PM asks for a
 * shape; the Head fills it from the bench. PMs see the requests they raised; the Head
 * sees the whole queue. Same data loading as the retired /staffing page. */
async function RequestsTab({ ctx }: { ctx: Ctx }) {
  const isHead = can(ctx, "staffing:manage");
  const [requests, myProjects] = await Promise.all([
    listResourceRequests(ctx),
    withTenant(ctx, (tx) =>
      tx.project.findMany({
        where: isHead
          ? {}
          : {
              OR: [
                { leadUserId: ctx.userId },
                { members: { some: { userId: ctx.userId, role: "Project Manager" } } },
              ],
            },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
    ),
  ]);

  return (
    <div className="w-full max-w-[1100px]">
      <p className="mb-5 text-[12.5px] text-[var(--ink3)]">
        {isHead
          ? "Fill requests from the bench — you own it."
          : "Ask for a shape (“1 QA · 60% · Aug–Sep”); the Head fills it from the bench."}
      </p>
      <StaffingClient
        isHead={isHead}
        viewerId={ctx.userId}
        projects={myProjects}
        requests={requests.map((r) => ({
          ...r,
          windowStart: r.windowStart.toISOString(),
          windowEnd: r.windowEnd.toISOString(),
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
