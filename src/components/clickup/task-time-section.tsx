"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, Trash2 } from "lucide-react";

interface Entry {
  id: string;
  start: string;
  end: string | null;
  durationMin: number | null;
  note: string | null;
  billable: boolean;
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Task-panel time section: tracked-vs-estimate, start/stop, entries, manual log. */
export function TaskTimeSection({ taskId, timeEstimate }: { taskId: string; timeEstimate: number | null }) {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [runningHere, setRunningHere] = useState(false);
  const [manual, setManual] = useState("");

  const load = useCallback(async () => {
    const [list, running] = await Promise.all([
      fetch(`/api/v1/tasks/${taskId}/time`).then((r) => r.json()),
      fetch(`/api/v1/time/running`).then((r) => r.json()),
    ]);
    setEntries(list.data?.entries ?? []);
    setTotal(list.data?.totalMin ?? 0);
    setRunningHere(running.data?.task?.id === taskId);
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshAll = () => {
    void load();
    router.refresh(); // updates the topbar timer widget
  };

  const start = async () => {
    const res = await fetch(`/api/v1/tasks/${taskId}/time/start`, { method: "POST" });
    if (res.ok) refreshAll();
    else {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Could not start timer.");
    }
  };
  const stop = async () => {
    const res = await fetch(`/api/v1/time/stop`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (res.ok) refreshAll();
  };
  const addManual = async () => {
    const min = Number(manual);
    if (!Number.isInteger(min) || min <= 0) return;
    const res = await fetch(`/api/v1/tasks/${taskId}/time`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ durationMin: min }),
    });
    if (res.ok) {
      setManual("");
      refreshAll();
    }
  };
  const remove = async (id: string) => {
    const res = await fetch(`/api/v1/time/${id}`, { method: "DELETE" });
    if (res.ok) refreshAll();
  };

  const estimate = timeEstimate ?? 0;
  const pct = estimate ? Math.min(100, Math.round((total / estimate) * 100)) : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold uppercase tracking-[.5px] text-[var(--ink4)]">Time tracking</div>

      <div className="flex items-center gap-3">
        {runningHere ? (
          <button
            type="button"
            onClick={stop}
            className="flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--bad)_16%,transparent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--bad)]"
          >
            <Square className="size-3.5" fill="currentColor" /> Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            className="flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] px-3 py-1.5 text-[12px] font-semibold text-brand"
          >
            <Play className="size-3.5" /> Start
          </button>
        )}
        <span className="text-[13px] text-[var(--ink2)]">
          <span className="font-semibold text-[var(--qink)]">{fmtMin(total)}</span>
          {estimate > 0 && <span className="text-[var(--ink4)]"> / {fmtMin(estimate)} est</span>}
        </span>
      </div>

      {estimate > 0 && (
        <div className="h-1 overflow-hidden rounded-full bg-[var(--w08)]">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: pct >= 100 ? "var(--bad)" : "var(--brand)" }}
          />
        </div>
      )}

      {entries.length > 0 && (
        <ul className="flex flex-col">
          {entries.map((e) => (
            <li key={e.id} className="group flex items-center gap-2 py-1 text-[12px] text-[var(--ink3)]">
              <span className="font-mono text-[var(--ink4)]">{new Date(e.start).toLocaleDateString()}</span>
              <span className="text-[var(--ink2)]">{e.durationMin != null ? fmtMin(e.durationMin) : "running…"}</span>
              {e.billable && <span className="text-[10px] text-[var(--ok)]">billable</span>}
              <button
                type="button"
                onClick={() => remove(e.id)}
                className="ml-auto opacity-0 hover:text-[var(--bad)] group-hover:opacity-100"
                aria-label="Delete entry"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && addManual()}
          placeholder="Log minutes…"
          inputMode="numeric"
          className="w-28 rounded-[7px] border border-[var(--w10)] bg-[var(--card2)] px-2 py-1.5 text-[12px] text-[var(--qink)] outline-none"
        />
        <button type="button" onClick={addManual} className="text-[12px] font-semibold text-[var(--ink4)] hover:text-brand">
          Add
        </button>
      </div>
    </div>
  );
}
