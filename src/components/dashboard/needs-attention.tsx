"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, MoonStar } from "lucide-react";

// The "Needs attention" strip (M1 layout, M3 nudges). Nudge rows carry a per-user
// snooze — "stop chasing ME about this" — which hides the row for this viewer only;
// the nudge keeps chasing everyone else it names.

interface Item {
  id: string;
  kind: string;
  title: string;
  meta: string;
  severity: string;
  href: string;
}

interface NudgeRef {
  id: string;
  entityId: string;
}

const SEV: Record<string, string> = { red: "--bad", amber: "--warn", info: "--qinfo" };

export function NeedsAttentionList({ items, nudges }: { items: Item[]; nudges: NudgeRef[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const nudgeIdByEntity = new Map(nudges.map((n) => [n.entityId, n.id]));

  const snooze = async (entityId: string) => {
    const nudgeId = nudgeIdByEntity.get(entityId);
    if (!nudgeId) return;
    setHidden((prev) => new Set(prev).add(entityId));
    await fetch(`/api/nudges/${nudgeId}/snooze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => setHidden((prev) => {
      const next = new Set(prev);
      next.delete(entityId);
      return next;
    }));
  };

  const visible = items.filter((p) => !hidden.has(p.id));
  if (visible.length === 0) {
    return <div className="p-[12px_16px] text-[12px] text-[var(--ink5)]">All clear — nothing needs you right now.</div>;
  }

  return (
    <>
      {visible.map((p) => (
        <div key={`${p.kind}:${p.id}`} className="group flex items-start gap-2.5 border-b border-[var(--hair2)] p-[9px_16px] transition-colors last:border-0 hover:bg-[var(--wash)]">
          <span className="mt-[5px] h-[22px] w-[3px] flex-none rounded-[2px]" style={{ background: `var(${SEV[p.severity] ?? "--qinfo"})` }} />
          <Link href={p.href} className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] text-[var(--ink2)]">{p.title}</span>
            <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[1px] text-[var(--ink4)]">{p.meta}</span>
          </Link>
          {p.kind === "nudge" && nudgeIdByEntity.has(p.id) && (
            <button
              type="button"
              onClick={() => void snooze(p.id)}
              title="Snooze this nudge for you (7 days)"
              aria-label="Snooze this nudge"
              className="mt-1 hidden flex-none rounded-[6px] border border-[var(--w07)] p-1 text-[var(--ink4)] transition-colors hover:text-[var(--qink)] group-hover:block"
            >
              <MoonStar className="size-3" />
            </button>
          )}
          <ArrowRight className="mt-1.5 size-3 flex-none text-[var(--ink5)]" />
        </div>
      ))}
    </>
  );
}
