import { cn } from "@/lib/utils";

/**
 * Design spec v2 KPI mini charts (docs/08 § KPI row and card). Charts only repeat what the
 * figure or legend already says, so they are aria-hidden; the legend carries the numbers.
 * `feat` renders the variant for the dark featured card.
 */

/** RAG bar: 8px pill split by count, 2px gaps, legend with bold counts under it. */
export function RagBar({ ok, warn, bad, labels = ["On track", "At risk", "Off track"], feat = false }: { ok: number; warn: number; bad: number; labels?: [string, string, string]; feat?: boolean }) {
  const total = ok + warn + bad;
  const parts = [
    { n: ok, fill: "var(--ds-ok)", label: labels[0] },
    { n: warn, fill: "var(--ds-warn)", label: labels[1] },
    { n: bad, fill: "var(--ds-bad)", label: labels[2] },
  ];
  return (
    <div>
      <div aria-hidden className="flex h-2 gap-[2px] overflow-hidden rounded-full" style={{ background: total ? undefined : feat ? "var(--ds-feat-track)" : "var(--ds-mutedw)" }}>
        {total > 0 && parts.filter((p) => p.n > 0).map((p) => <i key={p.label} className="block h-full" style={{ flexGrow: p.n, background: p.fill }} />)}
      </div>
      <div className={cn("mt-1.5 flex flex-wrap gap-x-2.5 text-[11px]", feat ? "text-[var(--ds-feat-sub)]" : "text-[var(--ds-ink3)]")}>
        {parts.map((p) => (
          <span key={p.label} className="whitespace-nowrap">
            <span aria-hidden className="mr-1 inline-block size-[7px] rounded-full align-[1px]" style={{ background: p.fill }} />
            <b className="font-bold">{p.n}</b> {p.label.toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Bars: 26px tall, 3px gaps, fill info-wash, the latest bar solid info. */
export function Bars({ values, feat = false }: { values: number[]; feat?: boolean }) {
  const max = Math.max(1, ...values);
  return (
    <div aria-hidden className="flex h-[26px] items-end gap-[3px]">
      {values.map((v, i) => {
        const last = i === values.length - 1;
        const fill = feat ? (last ? "#ff8a8f" : "var(--ds-feat-track)") : last ? "var(--ds-info)" : "var(--ds-infow)";
        return <i key={i} className="block min-h-[3px] flex-1 rounded-t-[3px]" style={{ height: `${(v / max) * 100}%`, background: fill }} />;
      })}
    </div>
  );
}

export type MeterTone = "info" | "ok" | "warn" | "bad";

/** Meter: 6px pill on the muted track. `value` and `max` in the same unit. */
export function Meter({ value, max, tone = "info", feat = false, className }: { value: number; max: number; tone?: MeterTone; feat?: boolean; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div aria-hidden className={cn("h-1.5 overflow-hidden rounded-full", className)} style={{ background: feat ? "var(--ds-feat-track)" : "var(--ds-mutedw)" }}>
      <i className="block h-full rounded-full" style={{ width: `${pct}%`, background: `var(--ds-${tone})` }} />
    </div>
  );
}

/** Spark: 30px area + line with an end dot, scaled to the series. */
export function Spark({ values, feat = false }: { values: number[]; feat?: boolean }) {
  const w = 120;
  const h = 30;
  const pad = 3;
  const pts = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const span = max - min || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * w, h - pad - ((v - min) / span) * (h - pad * 2)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const [ex, ey] = xy[xy.length - 1]!;
  const stroke = feat ? "#ff8a8f" : "var(--ds-info)";
  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block h-[30px] w-full overflow-visible">
      <path d={area} style={{ fill: feat ? "rgba(237,28,36,.18)" : "var(--ds-infow)" }} />
      <path d={line} fill="none" style={{ stroke }} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
      <circle cx={ex} cy={ey} r={2.4} style={{ fill: stroke }} />
    </svg>
  );
}
