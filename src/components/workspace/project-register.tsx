"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProjectBlockersSection } from "@/components/panels/project-blockers-section";
import { ProjectDependenciesCard } from "@/components/workspace/project-dependencies-card";
import { DecisionsCard } from "@/components/conversation/decisions-card";
import { LessonsCard } from "@/components/workspace/lessons-card";
import { heatBucket } from "@/components/raid/severity";

// DM1.73 — the project Register: ONE card for the RAID-ish logs that used to be five
// separate Overview cards (Blockers, Dependencies, Decisions, Lessons) plus the two that
// had NO project surface at all. Risks and Issues previously lived only on the global
// /risks page (hidden from members) — a PM had no way to see or raise a risk for their
// own project from the workspace. The existing sections are reused, not rewritten.

const REGISTER_TABS = ["Blockers", "Risks", "Issues", "Dependencies", "Decisions", "Lessons"] as const;
type RegisterTab = (typeof REGISTER_TABS)[number];

// Risk/issue severity → token. Same chip language as ProjectBlockersSection, extended to
// the RAID module's 4-level scale.
const SEV_TOKEN: Record<string, string> = { Low: "--ink4", Medium: "--qinfo", High: "--warn", Critical: "--bad" };

interface RiskRow {
  id: string;
  title: string;
  probability: number;
  impact: number;
  status: string;
  ownerName: string | null;
}

interface IssueRow {
  id: string;
  title: string;
  severity: string;
  status: string;
  ownerName: string | null;
}

function SevChip({ severity }: { severity: string }) {
  const tok = SEV_TOKEN[severity] ?? "--ink4";
  return (
    <span
      className="flex-none rounded-full px-2 py-0.5 text-[9.5px] font-bold"
      style={{ color: `var(${tok})`, background: `color-mix(in oklab, var(${tok}) 14%, transparent)` }}
    >
      {severity}
    </span>
  );
}

export function ProjectRegister({
  projectId,
  canContribute,
  canGovern,
  projects,
}: {
  projectId: string;
  /** Blockers edit + raise-risk — any project member. */
  canContribute: boolean;
  /** Dependency declarations — PM/Head (the route enforces it too). */
  canGovern: boolean;
  /** Dependency picker candidates (server-provided). */
  projects: { id: string; code: string; name: string }[];
}) {
  const [tab, setTab] = useState<RegisterTab>("Blockers");
  const [risks, setRisks] = useState<RiskRow[] | null>(null);
  const [issues, setIssues] = useState<IssueRow[] | null>(null);

  // Risks + issues load once for both the rows and the chip count badges. Blockers /
  // dependencies / decisions / lessons fetch their own data inside the reused sections,
  // so their chips carry no badge — we don't duplicate a fetch just for a number.
  const load = useCallback(async () => {
    const [r, i] = await Promise.all([
      fetch(`/api/risks?projectId=${projectId}`).then((res) => res.json()).catch(() => null),
      fetch(`/api/issues?projectId=${projectId}`).then((res) => res.json()).catch(() => null),
    ]);
    setRisks(r?.items ?? []);
    setIssues(i?.items ?? []);
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  const openRisks = (risks ?? []).filter((r) => r.status !== "Closed").length;
  const openIssues = (issues ?? []).filter((i) => i.status !== "Closed" && i.status !== "Resolved").length;
  const badge: Partial<Record<RegisterTab, number>> = { Risks: openRisks, Issues: openIssues };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-[13px] font-semibold text-foreground">Register</div>
      <div className="flex flex-wrap gap-1.5">
        {REGISTER_TABS.map((t) => {
          const active = tab === t;
          const count = badge[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors"
              style={{
                borderColor: active ? "var(--brand)" : "var(--hair)",
                background: active ? "color-mix(in oklab, var(--brand) 10%, transparent)" : "transparent",
                color: active ? "var(--brand)" : "var(--ink3)",
              }}
            >
              {t}
              {typeof count === "number" && count > 0 && (
                <span className="rounded-full px-1.5 text-[9.5px] font-bold tabular-nums" style={{ color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 12%, transparent)" }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "Blockers" && <ProjectBlockersSection projectId={projectId} canEdit={canContribute} />}
      {tab === "Risks" && <RisksSection projectId={projectId} risks={risks} canContribute={canContribute} onChanged={load} />}
      {tab === "Issues" && <IssuesSection issues={issues} />}
      {tab === "Dependencies" && <ProjectDependenciesCard projectId={projectId} canEdit={canGovern} projects={projects} />}
      {tab === "Decisions" && <DecisionsCard projectId={projectId} />}
      {tab === "Lessons" && <LessonsCard projectId={projectId} />}
    </div>
  );
}

const SCALE = ["1", "2", "3", "4", "5"] as const;

/** Project-scoped risk list + a minimal inline raise form (POST /api/risks: title,
 * probability 1-5, impact 1-5, projectId prefilled — membership is checked server-side). */
function RisksSection({
  projectId,
  risks,
  canContribute,
  onChanged,
}: {
  projectId: string;
  risks: RiskRow[] | null;
  canContribute: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [probability, setProbability] = useState("3");
  const [impact, setImpact] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const raise = async () => {
    if (title.trim().length < 3) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/risks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, title: title.trim(), probability: Number(probability), impact: Number(impact) }),
    });
    setBusy(false);
    if (res.ok) {
      setTitle("");
      setProbability("3");
      setImpact("3");
      void onChanged();
    } else {
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not raise the risk.");
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {(risks ?? []).map((r) => {
        const closed = r.status === "Closed";
        return (
          <div key={r.id} className="flex items-center gap-2 rounded-[6px] bg-background px-3 py-2 text-xs">
            <SevChip severity={heatBucket(r.probability, r.impact)} />
            <span className={`min-w-0 flex-1 truncate ${closed ? "text-ink-4 line-through" : "text-ink-2"}`}>
              {r.title}
              {r.ownerName && <span className="text-ink-4"> · {r.ownerName}</span>}
            </span>
            <span className="flex-none font-mono text-[9.5px] text-ink-4" title={`Probability ${r.probability} × impact ${r.impact}`}>
              P{r.probability}×I{r.impact}={r.probability * r.impact}
            </span>
            <span className="flex-none text-[10px] font-semibold text-ink-3">{r.status}</span>
          </div>
        );
      })}
      {risks !== null && risks.length === 0 && (
        <p className="text-xs text-ink-3">No risks raised for this project yet.</p>
      )}

      {canContribute && (
        <>
          <div className="flex items-center gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Raise a risk…" className="h-8 flex-1 text-xs" onKeyDown={(e) => e.key === "Enter" && raise()} />
            <Select value={probability} onValueChange={(v) => v && setProbability(v)}>
              <SelectTrigger className="h-8 w-[90px] text-[11px]" aria-label="Probability"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCALE.map((n) => <SelectItem key={n} value={n}>P {n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={impact} onValueChange={(v) => v && setImpact(v)}>
              <SelectTrigger className="h-8 w-[90px] text-[11px]" aria-label="Impact"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCALE.map((n) => <SelectItem key={n} value={n}>I {n}</SelectItem>)}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={raise}
              disabled={busy || title.trim().length < 3}
              className="flex items-center gap-1 rounded-[8px] bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] px-3 py-1.5 text-xs font-semibold text-brand disabled:opacity-50"
            >
              <Plus className="size-3.5" /> Raise
            </button>
          </div>
          {error && <p className="text-[11px] text-[var(--bad)]">{error}</p>}
        </>
      )}
    </div>
  );
}

/** Project-scoped issue list. Read-only here: an issue is born by materialising a risk
 * (or on the global /risks surface), never typed in fresh. */
function IssuesSection({ issues }: { issues: IssueRow[] | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      {(issues ?? []).map((i) => {
        const done = i.status === "Closed" || i.status === "Resolved";
        return (
          <div key={i.id} className="flex items-center gap-2 rounded-[6px] bg-background px-3 py-2 text-xs">
            <SevChip severity={i.severity} />
            <span className={`min-w-0 flex-1 truncate ${done ? "text-ink-4 line-through" : "text-ink-2"}`}>
              {i.title}
              {i.ownerName && <span className="text-ink-4"> · {i.ownerName}</span>}
            </span>
            <span className="flex-none text-[10px] font-semibold text-ink-3">{i.status}</span>
          </div>
        );
      })}
      {issues !== null && issues.length === 0 && (
        <p className="text-xs text-ink-3">No issues on this project. Issues arrive by materialising a risk from the Risks tab.</p>
      )}
    </div>
  );
}
