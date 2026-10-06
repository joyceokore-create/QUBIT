"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { EditProjectDialog } from "@/components/panels/edit-project-dialog";
import { AskQAbout } from "@/components/q/ask-q-about";
import { RequestToJoinButton } from "@/components/workspace/request-to-join-button";
import { FOCUS, ragChipStyle, ragFill } from "@/lib/surface";
import type { ProjectPanelJson } from "@/components/panels/project-panel-json";
import type { Rag } from "@/server/health";

// Milestone A (docs handoff §2) — the workspace header: no hero card, no gradient. The
// project's facts read as one block: breadcrumb, name + the two track chips, the
// description, a facts line, and the team on the right. Chips are server-computed
// (ProjectPanelJson.checkin) so they render with the page.

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** "Due 28 Oct · 23 days" split into parts so the relative bit can be bold / red. */
export function timelineParts(dueDate: string | null, now = new Date()): { date: string; rel: string; overdue: boolean } | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const days = Math.round((due.getTime() - now.getTime()) / 86_400_000);
  const date = due.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (days > 0) return { date, rel: `${days} ${days === 1 ? "day" : "days"}`, overdue: false };
  if (days === 0) return { date, rel: "today", overdue: false };
  return { date, rel: `${-days} ${days === -1 ? "day" : "days"} overdue`, overdue: true };
}

function RagChip({ label, rag }: { label: string; rag: Rag | null }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={rag ? ragChipStyle(rag) : { color: "var(--ink4)", background: "var(--wash2)" }}
    >
      <span className="size-[7px] rounded-full" style={rag ? ragFill(rag) : { background: "var(--ink5)" }} aria-hidden />
      {label} · {rag ?? "No check-in"}
    </span>
  );
}

export function WorkspaceHeader({
  data,
  members,
  onTeam,
}: {
  data: ProjectPanelJson;
  members: { name: string }[];
  onTeam: () => void;
}) {
  const router = useRouter();
  const ci = data.checkin ?? null;
  const markets = data.marketTracks ?? [];
  const tl = timelineParts(data.dueDate);
  const pct = data.avgProgress;
  const barTok = data.status === "Overdue" ? "--bad" : data.status === "AtRisk" ? "--warn" : "--brand";
  const extra = Math.max(0, members.length - 3);

  return (
    <header className="flex flex-col gap-3.5">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-[var(--ink4)]">
          <li>
            <Link href="/projects" className={`rounded-[4px] transition-colors hover:text-[var(--qink)] ${FOCUS}`}>
              Projects
            </Link>
          </li>
          {data.portfolioName && data.portfolioId && (
            <>
              <li aria-hidden className="text-[var(--ink5)]">/</li>
              <li>
                <Link href={`/portfolios/${data.portfolioId}`} className={`rounded-[4px] transition-colors hover:text-[var(--qink)] ${FOCUS}`}>
                  {data.portfolioName}
                </Link>
              </li>
            </>
          )}
          <li aria-hidden className="text-[var(--ink5)]">/</li>
          <li aria-current="page" className="font-medium text-[var(--qink)]">
            {data.code}
          </li>
        </ol>
      </nav>

      {/* The facts column keeps at least 320px, so on a phone the team/actions column wraps
          beneath it instead of squeezing the title into a sliver. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2">
          <div className="flex min-h-[36px] flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-[26px] rv:text-heading-lg font-bold leading-[1.25] tracking-[-.6px] text-[var(--qink)]">{data.name}</h1>
            {ci && <RagChip label="Build" rag={ci.buildRag} />}
            {ci && markets.length > 0 && <RagChip label="In market" rag={ci.marketRag} />}
            {data.canEdit && <EditProjectDialog project={data} onUpdated={() => router.refresh()} />}
          </div>
          {data.description && (
            <p className="max-w-[620px] text-[13.5px] rv:text-body-sm leading-[1.5] text-[var(--ink3)]">{data.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-[12.5px] text-[var(--ink3)]">
            <span className="flex items-center gap-2" role="img" aria-label={`Progress ${pct}%`}>
              <span className="h-[6px] w-[160px] max-w-full overflow-hidden rounded-full bg-[var(--wash2)]">
                <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: `var(${barTok})` }} />
              </span>
              <b className="tabular-nums text-[var(--qink)]">{pct}%</b>
            </span>
            {tl && (
              <span className="flex items-center gap-1.5" style={tl.overdue ? { color: "var(--bad)" } : undefined}>
                <Clock className="size-3.5" aria-hidden /> Due {tl.date} · <b className={tl.overdue ? "" : "text-[var(--qink)]"}>{tl.rel}</b>
              </span>
            )}
            {data.programmeName && <span>{data.programmeName}</span>}
            {markets.length > 0 && (
              <span>
                Markets · <b className="text-[var(--qink)]">{markets.map((m) => m.code).join(", ")}</b>
              </span>
            )}
            <span>
              Priority <b className="text-[var(--qink)]">{data.priority}</b>
            </span>
          </div>
        </div>

        <div className="flex flex-none flex-col items-start gap-2 sm:items-end">
          <div className="flex items-center gap-2.5">
            <div className="flex -space-x-1.5" role="group" aria-label={`${members.length} ${members.length === 1 ? "member" : "members"}`}>
              {members.slice(0, 3).map((m, i) => (
                <span
                  key={i}
                  className="flex size-[30px] items-center justify-center rounded-full border-2 border-[var(--qbg)] text-[10px] font-bold"
                  style={{ background: "color-mix(in oklab, var(--brand) 14%, transparent)", color: "var(--brand)" }}
                  title={m.name}
                >
                  {initials(m.name)}
                </span>
              ))}
              {extra > 0 && (
                <span className="flex size-[30px] items-center justify-center rounded-full border-2 border-[var(--qbg)] bg-[var(--wash2)] text-[10px] font-bold text-[var(--ink3)]">
                  +{extra}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onTeam}
              className={`rounded-[4px] text-[12.5px] font-semibold text-[var(--ink3)] transition-colors hover:text-brand ${FOCUS}`}
            >
              Team
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AskQAbout type="project" targetId={data.id} label="Ask Q about this project" />
            {!data.isMember && <RequestToJoinButton projectId={data.id} />}
          </div>
        </div>
      </div>
    </header>
  );
}
