"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { CARD_GLASS as CARD, CARD_BG, FOCUS, QUIET, ragFill } from "@/lib/surface";

/**
 * "Set up {code}" — the five things a PM does once so the week can run itself, each a
 * link to the tab where it happens. Lives above the status card until every row is done,
 * then disappears. "Hide for now" collapses it to one line (per project, this browser).
 */

export interface SetupJson {
  gates: boolean;
  documents: boolean;
  team: boolean;
  youtrack: boolean | null;
  thisWeek: boolean;
  done: number;
  total: number;
}

type Tab = "Delivery" | "Documents" | "Team" | "This week";

const ROWS: { key: keyof Omit<SetupJson, "done" | "total">; label: string; hint: string; tab: Tab; hash?: string }[] = [
  { key: "gates", label: "Delivery gates", hint: "attach the checkpoint template — progress derives from it", tab: "Delivery" },
  { key: "documents", label: "Documents", hint: "add the BRD, plan or spec", tab: "Documents" },
  { key: "team", label: "Team", hint: "add the people on this project", tab: "Team" },
  { key: "youtrack", label: "YouTrack", hint: "mirror the issues onto the Board", tab: "Team", hash: "integrations" },
  { key: "thisWeek", label: "This week's update", hint: "one line, one RAG, Confirm & send", tab: "This week" },
];

export function SetupChecklist({ projectId, code, setup, onGo }: { projectId: string; code: string; setup: SetupJson; onGo: (tab: Tab) => void }) {
  const key = `qubit.setup-hidden.${projectId}`;
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(key) === "1");
    } catch {
      /* no storage → shown */
    }
  }, [key]);
  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    try {
      if (next) window.localStorage.setItem(key, "1");
      else window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };
  const rows = ROWS.filter((r) => r.key !== "youtrack" || setup.youtrack !== null);
  const go = (r: (typeof ROWS)[number]) => {
    onGo(r.tab);
    if (r.hash) setTimeout(() => document.getElementById(r.hash!)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  return (
    <section className={`${CARD} overflow-hidden`} style={CARD_BG} aria-labelledby="setup-checklist">
      <div className="flex items-center gap-3 p-[12px_16px]">
        <h2 id="setup-checklist" className="text-[13.5px] font-semibold text-[var(--qink)]">
          Set up {code}
        </h2>
        <span className="text-[12px] tabular-nums text-[var(--ink4)]">
          {setup.done} of {setup.total}
        </span>
        <div className="h-1.5 w-[120px] overflow-hidden rounded-full bg-[var(--wash2)]" role="progressbar" aria-valuemin={0} aria-valuemax={setup.total} aria-valuenow={setup.done} aria-label="Setup progress">
          <span className="block h-full rounded-full" style={{ width: `${(setup.done / setup.total) * 100}%`, ...ragFill("Green") }} />
        </div>
        <button type="button" onClick={toggle} aria-expanded={!hidden} className={`${QUIET} ml-auto inline-flex items-center gap-1`}>
          {hidden ? "Show" : "Hide for now"}
          {hidden ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronUp className="size-3.5" aria-hidden />}
        </button>
      </div>
      {!hidden && (
        <ol className="border-t border-[var(--hair2)]">
          {rows.map((r) => {
            const done = Boolean(setup[r.key]);
            return (
              <li key={r.key} className="border-b border-[var(--hair2)] last:border-0">
                <button
                  type="button"
                  onClick={() => go(r)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--card2)] ${FOCUS}`}
                  aria-label={`${r.label}${done ? " — done" : ""}: ${r.hint}`}
                >
                  <span
                    className="flex size-[18px] flex-none items-center justify-center rounded-full border text-[var(--onbrand)]"
                    style={done ? { background: "var(--ok)", borderColor: "var(--ok)" } : { borderColor: "var(--input)" }}
                    aria-hidden
                  >
                    {done && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] font-semibold ${done ? "text-[var(--ink4)] line-through decoration-[var(--input)]" : "text-[var(--qink)]"}`}>{r.label}</span>
                    {!done && <span className="block text-[11.5px] text-[var(--ink4)]">{r.hint}</span>}
                  </span>
                  {!done && <span className="text-[11.5px] font-semibold text-[var(--ink3)]">Go →</span>}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
