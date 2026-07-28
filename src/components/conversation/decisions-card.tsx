"use client";

import { useEffect, useState } from "react";
import { Gavel } from "lucide-react";

// The project's decision log (M4) — what, why, who, when. Entries arrive by promoting
// a comment thread's outcome; the register keeps decisions from dying in Teams threads.

interface DecisionJson {
  id: string;
  title: string;
  rationale: string | null;
  decidedByName: string | null;
  decidedAt: string;
}

export function DecisionsCard({ projectId }: { projectId: string }) {
  const [decisions, setDecisions] = useState<DecisionJson[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/decisions`)
      .then((r) => r.json())
      .then((d) => setDecisions(d.data ?? []))
      .catch(() => {});
  }, [projectId]);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--qink)]">
        <Gavel className="size-3.5 text-[var(--ink4)]" /> Decisions
      </h3>
      {decisions.length === 0 && (
        <p className="text-[11px] text-[var(--ink5)]">None recorded — promote a comment thread&apos;s outcome to log one.</p>
      )}
      {decisions.map((d) => (
        <div key={d.id} className="flex flex-col gap-0.5 rounded-[10px] border border-[var(--w06)] bg-[var(--qcard)] p-2.5">
          <p className="text-[12px] font-semibold leading-[1.4] text-[var(--qink)]">{d.title}</p>
          {d.rationale && <p className="text-[11px] leading-[1.45] text-[var(--ink3)]">{d.rationale.slice(0, 160)}</p>}
          <p className="mt-0.5 text-[9.5px] text-[var(--ink5)]">
            {d.decidedByName ?? "—"} · {new Date(d.decidedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
      ))}
    </div>
  );
}
