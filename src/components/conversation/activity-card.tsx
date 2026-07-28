"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

// Event-sourced project activity (M4): a projection of the M0 domain-event outbox —
// nothing here is recorded separately, so it can never disagree with what happened.

interface ActivityJson {
  id: string;
  text: string;
  actorName: string | null;
  createdAt: string;
}

function relative(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export function ActivityCard({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ActivityJson[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/activity`)
      .then((r) => r.json())
      .then((d) => setItems((d.data ?? []).slice(0, 12)))
      .catch(() => {});
  }, [projectId]);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--qink)]">
        <Activity className="size-3.5 text-[var(--ink4)]" /> Activity
      </h3>
      {items.length === 0 && <p className="text-[11px] text-[var(--ink5)]">Quiet so far — activity appears as work moves.</p>}
      <div className="flex flex-col">
        {items.map((a) => (
          <div key={a.id} className="flex items-baseline gap-2 border-b border-[var(--hair2)] py-1.5 last:border-0">
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink2)]">
              <span className="font-semibold text-[var(--qink)]">{a.actorName ?? "QUBIT"}</span> {a.text}
            </span>
            <span className="flex-none font-mono text-[9px] text-[var(--ink5)]">{relative(a.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
