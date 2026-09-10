"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CockpitProject } from "@/server/dashboard-cockpit";
import type { DashboardLevel } from "@/lib/dashboard-level";
import { LEVEL_LABEL } from "@/lib/dashboard-level";
import { DIMENSIONS } from "@/server/rag-dimensions";
import { RagChip, DimensionSquares, Freshness, RiskList, MarketMatrix } from "./primitives";

interface Props {
  level: DashboardLevel;
  allowed: DashboardLevel[];
  projects: CockpitProject[];
  children: React.ReactNode;
}

const fmt = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—";

/**
 * The one client island for the cockpit. All visual content is server-rendered and passed as
 * `children`; this wraps it to add the reference's interactivity via event delegation:
 * a project drawer (click any [data-open]), section jumps ([data-jump]), a project search,
 * and the level switcher. Keeps client JS to a single component.
 */
export function CockpitInteractive({ level, allowed, projects, children }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const open = openId ? byId.get(openId) : null;

  // Search: hide non-matching project cards/rows in place (reference behaviour).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const q = query.trim().toLowerCase();
    root.querySelectorAll<HTMLElement>("[data-open]").forEach((el) => {
      const p = byId.get(el.dataset.open!);
      if (!p) return;
      const hay = `${p.name} ${p.desc} ${p.status} ${p.pmName ?? ""} ${p.portfolioName ?? ""}`.toLowerCase();
      const item = el.closest<HTMLElement>("tr, .cockpit-card") ?? el;
      item.hidden = !!q && !hay.includes(q);
    });
  }, [query, byId]);

  function onClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    const opener = target.closest<HTMLElement>("[data-open]");
    if (opener) { setOpenId(opener.dataset.open!); return; }
    const jump = target.closest<HTMLElement>("[data-jump]");
    if (jump) { document.getElementById(jump.dataset.jump!)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const pmCard = target.closest<HTMLElement>("[data-pm]");
    if (pmCard) { switchLevel("pm"); return; }
  }

  function switchLevel(next: DashboardLevel) {
    const sp = new URLSearchParams(params.toString());
    sp.set("level", next);
    router.push(`/dashboard?${sp.toString()}`);
  }

  return (
    <div ref={rootRef} onClick={onClick}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {allowed.length > 1 && (
          <div className="inline-flex rounded-lg border border-[var(--hair)] bg-[var(--wash2)] p-0.5" role="group" aria-label="Dashboard level">
            {allowed.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={l === level}
                onClick={() => switchLevel(l)}
                className={
                  l === level
                    ? "rounded-md bg-[var(--qink)] px-3 py-1.5 text-[13px] font-semibold text-[var(--bg)]"
                    : "rounded-md px-3 py-1.5 text-[13px] font-medium text-[var(--ink2)] hover:text-[var(--qink)]"
                }
              >
                {LEVEL_LABEL[l]}
              </button>
            ))}
          </div>
        )}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a project…"
          aria-label="Find a project"
          className="ml-auto w-[min(240px,60vw)] rounded-lg border border-[var(--hair)] bg-[var(--wash2)] px-3 py-1.5 text-[13px] text-[var(--qink)] outline-none placeholder:text-[var(--ink4)] focus-visible:ring-2 focus-visible:ring-[var(--brand-light)]"
        />
      </div>

      {children}

      {/* Project drawer */}
      {open && (
        <>
          <div className="fixed inset-0 z-30 bg-black/35" onClick={() => setOpenId(null)} aria-hidden />
          <aside
            className="fixed inset-y-0 right-0 z-40 flex w-[min(560px,100vw)] flex-col gap-4 overflow-auto border-l border-[var(--cardbd)] bg-[var(--cardbg)] p-6 backdrop-blur-xl"
            aria-label={`${open.name} detail`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-[var(--ink4)]">{open.category} · PM {open.pmName ?? "unassigned"}</div>
                <h2 className="text-[18px] font-semibold text-[var(--qink)]">{open.name}</h2>
                <p className="mt-0.5 text-[13px] text-[var(--ink3)]">{open.desc}</p>
              </div>
              <button onClick={() => setOpenId(null)} aria-label="Close" className="grid size-8 place-items-center rounded-md border border-[var(--hair)] text-[var(--ink3)]">×</button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--hair)] pt-3">
              <span className="text-[11px] uppercase tracking-wide text-[var(--ink4)]">Reported</span><RagChip rag={open.reported} solid />
              <span className="text-[11px] uppercase tracking-wide text-[var(--ink4)]">Calculated</span><RagChip rag={open.calculated} solid />
              {open.dispute && <span className="rounded px-1.5 py-px text-[11px] font-semibold" style={{ background: "var(--badbg)", color: "var(--bad)" }}>reported greener — justification required</span>}
              <span className="ml-auto"><Freshness days={open.freshnessDays} /></span>
            </div>

            <div className="border-t border-[var(--hair)] pt-3">
              <h3 className="mb-2 text-[11px] uppercase tracking-wide text-[var(--ink4)]">Progress & dates</h3>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                <span className="text-[var(--ink3)]">Progress</span><b className="text-[var(--qink)]">{open.pct}%</b>
                <span className="text-[var(--ink3)]">Target</span><b className="text-[var(--qink)]">{fmt(open.dueDate)}{open.targetPassed ? " · passed" : ""}</b>
                <span className="text-[var(--ink3)]">Next milestone</span><b className="text-[var(--qink)]">{open.nextMilestone?.name ?? "—"} {open.nextMilestone?.dueDate ? `· ${fmt(open.nextMilestone.dueDate)}` : ""}</b>
              </div>
              <div className="mt-2"><DimensionSquares p={open} /></div>
            </div>

            <div className="border-t border-[var(--hair)] pt-3">
              <h3 className="mb-2 text-[11px] uppercase tracking-wide text-[var(--ink4)]">RAG by dimension</h3>
              <div className="grid grid-cols-[1fr_auto] gap-y-1 text-[13px]">
                {DIMENSIONS.map((d) => (
                  <div key={d} className="contents">
                    <span className="text-[var(--ink3)]">{d}</span>
                    <RagChip rag={open.dims[d]} />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-[var(--ink4)]">Calculated is derived from gate status, baseline dates and open RAID — it cannot be edited.</p>
            </div>

            {open.update && (
              <div className="border-t border-[var(--hair)] pt-3">
                <h3 className="mb-2 text-[11px] uppercase tracking-wide text-[var(--ink4)]">Update & outlook</h3>
                <p className="text-[13px] text-[var(--ink2)]">{open.update}</p>
              </div>
            )}

            {open.risks.length > 0 && (
              <div className="border-t border-[var(--hair)] pt-3">
                <h3 className="mb-2 text-[11px] uppercase tracking-wide text-[var(--ink4)]">Open risks</h3>
                <RiskList risks={open.risks} />
              </div>
            )}

            {open.markets.length > 0 && (
              <div className="border-t border-[var(--hair)] pt-3">
                <h3 className="mb-2 text-[11px] uppercase tracking-wide text-[var(--ink4)]">Market rollout</h3>
                <MarketMatrix markets={open.markets} />
              </div>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
