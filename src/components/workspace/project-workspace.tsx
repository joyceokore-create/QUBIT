"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { formatDate } from "@/components/panels/panel-primitives";
import { EditProjectDialog } from "@/components/panels/edit-project-dialog";
import { ProjectResourcesSection } from "@/components/panels/project-resources-section";
import { ProjectBlockersSection } from "@/components/panels/project-blockers-section";
import { ProjectBoard } from "@/components/workspace/project-board";
import { ProjectMilestonesSection } from "@/components/workspace/project-milestones-section";
import { DocumentsSection } from "@/components/workspace/documents-section";
import { StatusUpdatesSection } from "@/components/workspace/status-updates-section";
import { IntegrationsGrid } from "@/components/workspace/integrations-grid";
import { AskQAbout } from "@/components/q/ask-q-about";
import { statusMeta } from "@/lib/project-view";
import type { ProjectPanelJson } from "@/components/panels/project-panel-content";

const TABS = ["Overview", "Board", "Documents", "Deadlines", "Team", "Integrations"] as const;
type Tab = (typeof TABS)[number];

// Standard delivery gates — the v3 stage-gate rail is derived from live task progress + the
// project's status (no separate gate model), so it stays honest to the data.
const GATES = ["Discovery", "Requirements", "Design", "Development", "Testing", "UAT", "Deployment", "Hypercare"];
const GATE_STATE: Record<string, { label: string; tok: string }> = {
  "--stD": { label: "PASSED", tok: "--stD" },
  "--stA": { label: "ACTIVE", tok: "--stA" },
  "--stL": { label: "LATE", tok: "--stL" },
  "--stP": { label: "PENDING", tok: "--ink5" },
};
function gateRail(progressPct: number, status: string) {
  const passed = Math.max(0, Math.min(8, Math.round((progressPct / 100) * 8)));
  const late = status === "AtRisk" || status === "Overdue";
  const activeCell = status === "Completed" ? "--stD" : late ? "--stL" : "--stA";
  return GATES.map((name, i) => {
    const cell = i < passed ? "--stD" : i === passed ? activeCell : "--stP";
    return { num: i + 1, name, cell, ...GATE_STATE[cell] };
  });
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function timeline(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const days = Math.round((new Date(dueDate).getTime() - Date.now()) / 86400000);
  const d = new Date(dueDate).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (days > 0) return `${days} ${days === 1 ? "day" : "days"} to close · ${d}`;
  if (days === 0) return `Due today · ${d}`;
  return `${-days} ${days === -1 ? "day" : "days"} overdue · ${d}`;
}

const CARD = "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";

export function ProjectWorkspace({
  data,
  members,
}: {
  data: ProjectPanelJson;
  members: { name: string }[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Overview");
  const canEdit = data.canEdit;
  const eyebrow = [data.portfolioName, data.programmeName].filter(Boolean).join(" · ") || "Standalone";
  const tl = timeline(data.dueDate);
  const sm = statusMeta(data.status);
  // Use the same org-status progress the ledger/dashboard show (avgProgress), so the
  // workspace hero + gate rail are consistent with every other surface.
  const pct = data.avgProgress;
  const gates = gateRail(pct, data.status);
  const barTok = data.status === "Overdue" ? "--bad" : data.status === "AtRisk" ? "--warn" : "--brand";

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-3.5 p-[18px_24px_90px]">
      <Link href="/projects" className="flex w-fit items-center gap-1.5 text-[12px] font-semibold text-[var(--ink4)] transition-colors hover:text-brand [animation:rise_.4s_cubic-bezier(.22,1,.36,1)_both]">
        <ArrowLeft className="size-3.5" /> Projects
      </Link>

      {/* Hero */}
      <section className={`relative overflow-hidden p-[24px_28px] [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.03s_both] ${CARD}`} style={{ background: "var(--cardbg)" }}>
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(800px 300px at 6% -50%, color-mix(in oklab, var(--brand) 13%, transparent), transparent 62%)" }} />
        <div className="relative flex flex-wrap items-start justify-between gap-[22px]">
          <div className="min-w-0 flex-1">
            <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[2.2px] text-[var(--ink4)]">{eyebrow} · {data.code}</div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-[29px] font-bold tracking-[-.9px] text-[var(--qink)]">{data.name}</h1>
              <span
                className="rounded-[5px] p-[4px_8px] font-mono text-[9.5px] font-semibold tracking-[1px]"
                style={{ color: `var(${sm.tok})`, border: `1px solid color-mix(in oklab, var(${sm.tok}) 35%, transparent)`, background: `color-mix(in oklab, var(${sm.tok}) 9%, transparent)` }}
              >
                {sm.label}
              </span>
            </div>
            {data.description && <p className="mt-[7px] max-w-[520px] text-[13px] text-[var(--ink3)]">{data.description}</p>}
            <div className="mt-3.5 flex flex-wrap items-center gap-3">
              <span className="h-[5px] w-[280px] max-w-full overflow-hidden rounded-full bg-[var(--wash2)]">
                <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: `var(${barTok})` }} />
              </span>
              <span className="font-heading text-[16px] font-bold tabular-nums text-[var(--qink)]">{pct}%</span>
              <span className="font-mono text-[9.5px] tracking-[1px] text-[var(--ink4)]">GATE PROGRESS</span>
              {tl && (
                <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold" style={{ color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 12%, transparent)" }}>
                  <Clock className="size-3.5" /> {tl}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex -space-x-1.5">
                {members.slice(0, 5).map((m, i) => (
                  <span key={i} className="flex size-[30px] items-center justify-center rounded-full border-2 border-[var(--qbg)] text-[10px] font-bold" style={{ background: "color-mix(in oklab, var(--brand) 14%, transparent)", color: "var(--brand)" }} title={m.name}>
                    {initials(m.name)}
                  </span>
                ))}
              </div>
              <span className="text-[12px] text-[var(--ink3)]">{members.length} {members.length === 1 ? "member" : "members"}</span>
            </div>
            <AskQAbout type="project" targetId={data.id} label="Ask Q about this project" />
          </div>
        </div>

        {/* Stage-gate rail */}
        <div className="relative mt-[22px] border-t border-[var(--hair2)] pt-[18px]">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {gates.map((g) => (
              <div key={g.num} className="flex flex-col gap-[7px] rounded-[10px] p-2" title={`Gate ${g.num}: ${g.name} — ${g.label}`}>
                <span className="flex items-center gap-1.5">
                  <span className="size-[11px] rounded-[3px]" style={{ background: `var(${g.cell})` }} />
                  <span className="flex-1 border-b border-dashed border-[var(--hair)]" />
                </span>
                <span className="font-mono text-[8.5px] tracking-[1px] text-[var(--ink5)]">GATE {g.num}</span>
                <span className="min-h-[28px] text-[11px] font-semibold leading-[1.25] text-[var(--ink2)]">{g.name}</span>
                <span className="font-mono text-[8.5px] font-semibold tracking-[1px]" style={{ color: `var(${g.tok})` }}>{g.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.06s_both]">
        {TABS.map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
              style={{
                borderColor: active ? "var(--brand)" : "var(--hair)",
                background: active ? "color-mix(in oklab, var(--brand) 10%, transparent)" : "transparent",
                color: active ? "var(--brand)" : "var(--ink3)",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.1s_both]">
        {tab === "Overview" && (
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_360px]">
            <StatusUpdatesSection projectId={data.id} canEdit={canEdit} />
            <aside className="flex flex-col gap-3.5">
              {data.description && (
                <div className={`${CARD} p-4 text-[13px] leading-relaxed text-[var(--ink2)]`} style={{ background: "var(--cardbg)" }}>
                  {data.description}
                </div>
              )}
              <div className={`${CARD} p-4`} style={{ background: "var(--cardbg)" }}>
                <div className="grid grid-cols-1 gap-3">
                  {data.businessOwner && <Def label="Business Owner" value={data.businessOwner} />}
                  {data.client && <Def label="Client" value={data.client} />}
                  <Def label="Timeline" value={`${formatDate(data.startDate)} → ${formatDate(data.dueDate)}`} />
                  {data.objective && <Def label="Objective" value={data.objective} />}
                  {data.mission && <Def label="Mission" value={data.mission} />}
                </div>
              </div>
            </aside>
          </div>
        )}
        {tab === "Board" && <ProjectBoard projectId={data.id} canEdit={canEdit} />}
        {tab === "Documents" && <DocumentsSection projectId={data.id} canEdit={canEdit} />}
        {tab === "Deadlines" && (
          <div className="flex flex-col gap-3.5">
            <div className={`${CARD} p-4`} style={{ background: "var(--cardbg)" }}>
              <ProjectMilestonesSection projectId={data.id} canEdit={canEdit} />
            </div>
            <div className={`${CARD} p-4`} style={{ background: "var(--cardbg)" }}>
              <ProjectBlockersSection projectId={data.id} canEdit={canEdit} />
            </div>
          </div>
        )}
        {tab === "Team" && (
          <div className={`${CARD} p-4`} style={{ background: "var(--cardbg)" }}>
            <ProjectResourcesSection projectId={data.id} canEdit={canEdit} />
          </div>
        )}
        {tab === "Integrations" && <IntegrationsGrid projectId={data.id} canEdit={canEdit} />}
      </div>

      {canEdit && (
        <div className="fixed bottom-5 right-5 z-30">
          <EditProjectDialog project={data} onUpdated={() => router.refresh()} />
        </div>
      )}
    </main>
  );
}

function Def({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[1px] text-[var(--ink4)]">{label}</div>
      <div className="mt-0.5 text-[12.5px] text-[var(--ink2)]">{value}</div>
    </div>
  );
}
