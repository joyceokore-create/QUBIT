"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Square, Timer } from "lucide-react";

interface Running {
  id: string;
  start: string;
  task: { id: string; seq: number; name: string } | null;
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Global running-timer indicator (04-module-specs §13). Lives in the topbar, so it
 * persists across navigation; it re-reads the running timer on mount and ticks the
 * elapsed display each second.
 */
export function TimerWidget() {
  const router = useRouter();
  const [running, setRunning] = useState<Running | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const res = await fetch("/api/v1/time/running");
    if (res.ok) setRunning((await res.json()).data ?? null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const stop = async () => {
    const res = await fetch("/api/v1/time/stop", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (res.ok) {
      setRunning(null);
      router.refresh();
    }
  };

  if (!running) return null;

  const elapsed = fmt(now - new Date(running.start).getTime());
  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--w10)] bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] py-1 pl-3 pr-1.5">
      <Timer className="size-3.5 text-brand" />
      <span className="max-w-[140px] truncate text-[12px] text-[var(--ink2)]" title={running.task?.name}>
        {running.task ? `QBT-${running.task.seq}` : "Timer"}
      </span>
      <span className="font-mono text-[12px] font-semibold text-brand tabular-nums">{elapsed}</span>
      <button
        type="button"
        onClick={stop}
        title="Stop timer"
        className="flex size-6 items-center justify-center rounded-full text-[var(--ink3)] hover:bg-[var(--w08)] hover:text-[var(--bad)]"
      >
        <Square className="size-3.5" fill="currentColor" />
      </button>
    </div>
  );
}
