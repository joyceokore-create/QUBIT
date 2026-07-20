"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

// "Awaiting my approval" (PROMPT §6) — pending join requests the viewer may decide (their
// projects', plus all pending for heads/SuperAdmin). Self-hides when there's nothing to review,
// so it can render for everyone without a role check.
interface Pending {
  id: string;
  projectCode: string;
  projectName: string;
  userName: string;
  requestedRole: string | null;
  note: string | null;
}

export function ApprovalQueue() {
  const [items, setItems] = useState<Pending[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  async function load() {
    try {
      const res = await fetch("/api/join-requests");
      const json = await res.json();
      setItems(json.items ?? []);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(id: string, action: "approve" | "deny") {
    setBusy((prev) => new Set(prev).add(id));
    try {
      await fetch(`/api/join-requests/${id}/${action}`, { method: "POST" });
      await load();
    } finally {
      setBusy((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }
  }

  if (!items || items.length === 0) return null;

  return (
    <section className="[animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.08s_both]">
      <div className="mb-2 flex items-center gap-2">
        <span className="size-1.5 rounded-[2px] bg-[var(--brand)]" />
        <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[2px] text-brand">Awaiting my approval</span>
        <span className="font-mono text-[9.5px] text-[var(--ink5)]">{items.length}</span>
      </div>
      <div className="overflow-hidden rounded-[14px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]" style={{ background: "var(--cardbg)" }}>
        {items.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b border-[var(--hair2)] p-[10px_15px] last:border-0">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-[var(--ink2)]">
                <span className="font-semibold text-[var(--qink)]">{r.userName}</span> wants to join {r.projectName}
                {r.requestedRole ? ` as ${r.requestedRole}` : ""}
              </span>
              <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[1.2px] text-[var(--ink4)]">
                {r.projectCode}
                {r.note ? ` · ${r.note}` : ""}
              </span>
            </span>
            <button
              type="button"
              onClick={() => decide(r.id, "approve")}
              disabled={busy.has(r.id)}
              className="flex items-center gap-1 rounded-full border border-[var(--hair)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--ok)] hover:text-[var(--ok)] disabled:opacity-50"
            >
              <Check className="size-3" /> Approve
            </button>
            <button
              type="button"
              onClick={() => decide(r.id, "deny")}
              disabled={busy.has(r.id)}
              className="flex items-center gap-1 rounded-full border border-[var(--hair)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink4)] transition-colors hover:border-[var(--bad)] hover:text-[var(--bad)] disabled:opacity-50"
            >
              <X className="size-3" /> Deny
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
