import Link from "next/link";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { withTenant } from "@/lib/tenant";
import { listWorkload } from "@/server/resources";
import { listResourceRequests } from "@/server/staffing";
import { ExportButton } from "@/components/export-button";
import { Forbidden } from "@/components/forbidden";
import { RecordLeaveDialog } from "@/components/people/record-leave-dialog";
import { StaffingClient } from "../staffing/staffing-client";

// Same bespoke table treatment as the admin surfaces (Teams/Audit): elevated card
// + grid rows, uppercase overline header, divider rows.
const CARD =
  "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";
const ROW =
  "grid grid-cols-[minmax(0,1.4fr)_160px_minmax(0,1.8fr)_150px] items-start gap-3.5 p-[12px_18px]";

type TabKey = "directory" | "requests";

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// DM1.73 — People + Staffing merged into one page: tab "Directory" (workload table)
// and tab "Staffing requests" (the former /staffing surface, gated on project:create).
// The directory doubles as the data behind the Q copilot's per-resource report
// (MVP1 Phase B).
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
    <div className="flex w-full flex-1 flex-col gap-4 p-[26px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[21px] rv:text-heading-md font-bold tracking-[-0.5px] text-foreground">People</h1>
          <p className="mt-[3px] text-xs rv:text-body-sm text-ink-3">
            {tab === "requests"
              ? "Resource requests — ask for a shape; the Head fills it from the bench."
              : "Resource allocation across projects"}
          </p>
        </div>
        {tab === "directory" && (
          <div className="flex items-center gap-2">
            {canRecordLeave && <RecordLeaveDialog people={leavePeople} />}
            <ExportButton href="/api/export?kind=allocations" />
          </div>
        )}
      </div>

      {tabs.length > 1 && (
        <nav className="flex flex-wrap items-center gap-1.5">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/people?tab=${t.key}`}
              aria-current={t.key === tab ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[.8px] transition-colors ${
                t.key === tab
                  ? "bg-[var(--brand)] text-[var(--onbrand)]"
                  : "border border-[var(--w07)] text-[var(--ink4)] hover:text-[var(--qink)]"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}

      {tab === "directory" ? <DirectoryTab ctx={ctx} /> : <RequestsTab ctx={ctx} />}
    </div>
  );
}

type Ctx = { tenantId: string; userId: string; roles: string[]; permissions?: string[] };

/** The workload directory — everyone with their project allocations. DM1.73: shows the
 * leave-aware effectivePct alongside the booked totalPct, badges people away today, and
 * sorts by effectivePct descending so over-allocated people surface first. */
async function DirectoryTab({ ctx }: { ctx: Ctx }) {
  const people = (await listWorkload(ctx)).sort((a, b) => b.effectivePct - a.effectivePct);

  return (
    <div className={`overflow-hidden ${CARD}`} style={{ background: "var(--cardbg)" }}>
      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          <div className={`${ROW} items-center border-b border-[var(--hair)] font-mono rv:font-sans text-[9px] rv:text-overline font-semibold uppercase tracking-[1.6px] text-[var(--ink4)]`}>
            <span>Person</span>
            <span>Department</span>
            <span>Projects</span>
            <span className="justify-self-end">Allocation</span>
          </div>
          {people.map((p) => (
            <div key={p.userId} className={`${ROW} border-b border-[var(--hair2)] transition-colors last:border-0 hover:bg-[var(--wash)]`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] rv:text-body-sm font-semibold text-[var(--qink)]">{p.name}</span>
                  {p.onLeaveUntil && (
                    <span className="flex-none rounded-full bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] px-2 py-0.5 text-[10px] rv:text-body-xs font-semibold text-[var(--warn)]">
                      on leave until {fmtDate(p.onLeaveUntil)}
                    </span>
                  )}
                </div>
                <div className="truncate text-[11px] rv:text-body-xs text-[var(--ink4)]">{p.email}</div>
              </div>
              <span className="text-[12px] rv:text-body-sm text-[var(--ink3)]">{p.departmentName ?? "—"}</span>
              <div className="min-w-0">
                {p.allocations.length === 0 ? (
                  <span className="text-[12px] text-[var(--ink4)]">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {p.allocations.map((a) => (
                      <span key={a.projectCode} className="rounded-full bg-[var(--wash2)] px-2.5 py-0.5 text-[11px] rv:text-body-xs text-[var(--ink2)]" title={`${a.role}${a.allocationPct != null ? ` · ${a.allocationPct}%` : ""}`}>
                        {a.projectName} · {a.role}
                        {a.allocationPct != null ? ` (${a.allocationPct}%)` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="justify-self-end text-right">
                <span
                  className="text-[13px] rv:text-body-sm font-semibold tabular-nums"
                  style={{ color: p.effectivePct > 100 ? "var(--bad)" : "var(--ink2)" }}
                  title={p.effectivePct > 100 ? "Over-allocated (leave-aware)" : "Effective allocation over the next fortnight, leave-aware"}
                >
                  {p.effectivePct}%
                </span>
                {p.effectivePct !== p.totalPct && (
                  <div className="text-[10.5px] rv:text-body-xs tabular-nums text-[var(--ink4)]" title="Booked allocation before leave is applied">
                    {p.totalPct}% booked
                  </div>
                )}
              </div>
            </div>
          ))}
          {people.length === 0 && (
            <div className="p-8 text-center text-[12px] rv:text-body-sm text-[var(--ink5)]">No people yet.</div>
          )}
        </div>
      </div>
    </div>
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
