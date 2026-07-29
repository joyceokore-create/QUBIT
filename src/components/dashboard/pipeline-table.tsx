import Link from "next/link";
import { ArrowRight, Flag, Gauge, ShieldAlert, TriangleAlert, UsersRound } from "lucide-react";
import type { PipelineGroup, PipelineRow, PipelineTableData } from "@/server/pipeline";
import { CARD } from "@/components/dashboard/presets/v2-sections";

// The portfolio pipeline table (docs/18 §1/§6): projects grouped by pipeline stage,
// stage headers with counts, priority, derived %, latest status note, and the
// per-project stat chips that replaced the global KPI strip (18 §0 decision №1).
// ONE component for every persona — the exec sees all; others get scope="mine".
// Checkpoint ticks join in M-D; the column shows derived % until that data exists.

const RAG_TOKEN: Record<string, string> = { Green: "--ok", Amber: "--warn", Red: "--bad" };
const PRIORITY_TOKEN: Record<string, string> = {
  High: "--bad",
  Strat: "--qinfo",
  New: "--ok",
  Med: "--warn",
  Low: "--ink4",
  Paused: "--ink5",
};
const STAGE_BLURB: Record<string, string> = {
  Exploring: "ideas being shaped",
  Evaluating: "business case under review",
  Approved: "in delivery",
  Paused: "parked by decision",
};

function Chip({ icon: Icon, value, label, tok }: { icon: typeof Flag; value: number | string; label: string; tok: string }) {
  return (
    <span
      title={label}
      className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 font-mono text-[9px] font-semibold tabular-nums"
      style={{ color: `var(${tok})`, background: `color-mix(in oklab, var(${tok}) 10%, transparent)` }}
    >
      <Icon className="size-2.5" aria-hidden /> {value}
    </span>
  );
}

function Row({ row, boardLinks }: { row: PipelineRow; boardLinks?: boolean }) {
  const href = boardLinks ? `/projects/${row.id}?tab=Board&lens=dev` : `/projects/${row.id}`;
  const c = row.chips;
  return (
    <Link
      href={href}
      className="grid grid-cols-[minmax(0,1.2fr)_64px_72px_minmax(0,1.4fr)_auto] items-center gap-3 border-b border-[var(--hair2)] p-[9px_16px] transition-colors last:border-0 hover:bg-[var(--wash)] max-md:grid-cols-[minmax(0,1fr)_64px_auto]"
    >
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-semibold text-[var(--qink)]">{row.name}</span>
        <span className="block truncate font-mono text-[9px] uppercase tracking-[.8px] text-[var(--ink4)]">
          {row.code}
          {row.description ? ` · ${row.description}` : ""}
        </span>
      </span>
      <span
        className="justify-self-start rounded-[5px] border px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px]"
        style={{
          color: `var(${PRIORITY_TOKEN[row.priority] ?? "--ink4"})`,
          borderColor: `color-mix(in oklab, var(${PRIORITY_TOKEN[row.priority] ?? "--ink4"}) 35%, transparent)`,
        }}
      >
        {row.priority}
      </span>
      {/* Derived %, never typed (docs/18 §2) — checkpoint ticks replace this in M-D. */}
      <span className="flex items-center gap-1.5 max-md:hidden">
        <span className="h-[3px] w-9 overflow-hidden rounded-full bg-[var(--wash2)]">
          <span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${row.progress}%` }} />
        </span>
        <span className="font-mono text-[9.5px] tabular-nums text-[var(--ink3)]">{row.progress}%</span>
      </span>
      <span className="min-w-0 truncate text-[11px] italic text-[var(--ink3)] max-md:hidden">
        {row.note ?? (row.unconfirmed ? "check-in unconfirmed this week" : "—")}
      </span>
      <span className="flex flex-none items-center gap-1">
        <Chip icon={ShieldAlert} value={c.risksOpen} label={`${c.risksOpen} open risk(s)`} tok={c.risksOpen ? "--warn" : "--ink4"} />
        <Chip
          icon={Flag}
          value={c.milestonesOverdue ? `${c.milestonesUpcoming}/${c.milestonesOverdue}!` : c.milestonesUpcoming}
          label={`${c.milestonesUpcoming} milestone(s) upcoming · ${c.milestonesOverdue} overdue`}
          tok={c.milestonesOverdue ? "--bad" : "--ink4"}
        />
        <Chip icon={Gauge} value={c.velocity7d} label={`${c.velocity7d} task(s) completed in 7d`} tok="--qinfo" />
        <Chip icon={TriangleAlert} value={c.health} label={`Health: ${c.health} (computed)`} tok={RAG_TOKEN[c.health]} />
        <Chip icon={UsersRound} value={c.resources} label={`${c.resources} allocated member(s)`} tok="--ink4" />
        <ArrowRight className="ml-1 size-3 text-[var(--ink5)]" />
      </span>
    </Link>
  );
}

export function PipelineTable({
  data,
  scope = "all",
  boardLinks = false,
  title = "Portfolio pipeline",
}: {
  data: PipelineTableData;
  scope?: "all" | "mine";
  boardLinks?: boolean;
  title?: string;
}) {
  const groups: PipelineGroup[] = data.groups
    .map((g) => ({ ...g, rows: scope === "mine" ? g.rows.filter((r) => r.isMine) : g.rows }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className={CARD} style={{ background: "var(--cardbg)", animation: "rise .5s cubic-bezier(.22,1,.36,1) both" }}>
      <div className="flex items-baseline gap-2.5 border-b border-[var(--hair)] p-[12px_16px]">
        <span className="font-heading text-[13.5px] rv:text-heading-xs font-bold text-[var(--qink)]">{title}</span>
        <span className="font-mono rv:font-sans text-[9px] rv:text-overline tracking-[1.2px] text-[var(--ink4)]">
          {scope === "mine" ? `${data.mineCount} OF ${data.total}` : `${data.total} PROJECTS`} · GROUPED BY STAGE
        </span>
      </div>
      {groups.length === 0 && (
        <div className="p-[12px_16px] text-[12px] text-[var(--ink5)]">No projects in scope.</div>
      )}
      {groups.map((g) => (
        <div key={g.stage}>
          <div className="flex items-baseline gap-2 border-b border-[var(--hair)] bg-[var(--wash)] p-[7px_16px]">
            <span className="font-mono text-[9.5px] font-bold uppercase tracking-[1.4px] text-[var(--qink)]">{g.stage}</span>
            <span className="font-mono text-[9px] tabular-nums text-[var(--ink4)]">{g.rows.length}</span>
            <span className="font-mono text-[8.5px] uppercase tracking-[.8px] text-[var(--ink5)]">{STAGE_BLURB[g.stage]}</span>
          </div>
          {g.rows.map((row) => (
            <Row key={row.id} row={row} boardLinks={boardLinks} />
          ))}
        </div>
      ))}
    </div>
  );
}
