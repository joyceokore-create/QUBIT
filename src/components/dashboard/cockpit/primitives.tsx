// Presentational cockpit primitives (server-safe — no "use client"). They render the reference
// "Delivery Cockpit" parts using QUBIT's theme tokens (--ok/--warn/--bad, --qink, --cardbg…),
// so the cockpit is theme-aware in both shells. Interactivity (drawer/search/collapse) is added
// by the client wrapper via event delegation; cards/rows here just carry data-open / data-jump.

import type { CockpitProject } from "@/server/dashboard-cockpit";
import type { DimRag } from "@/server/rag-dimensions";
import { DIMENSIONS } from "@/server/rag-dimensions";

const RAG_LABEL: Record<DimRag, string> = { G: "Green", A: "Amber", R: "Red", N: "Not rated" };
const RAG_BG: Record<DimRag, string> = { G: "var(--okbg)", A: "var(--warnbg)", R: "var(--badbg)", N: "var(--wash2)" };
const RAG_FG: Record<DimRag, string> = { G: "var(--ok)", A: "var(--warn)", R: "var(--bad)", N: "var(--ink4)" };
const RAG_SOLID: Record<DimRag, string> = { G: "var(--ok)", A: "var(--warn)", R: "var(--bad)", N: "var(--ink4)" };

export function RagChip({ rag, solid }: { rag: DimRag; solid?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold"
      style={solid ? { background: RAG_SOLID[rag], color: "#fff" } : { background: RAG_BG[rag], color: RAG_FG[rag] }}
    >
      {!solid && <span className="size-2 rounded-full" style={{ background: "currentColor" }} />}
      {RAG_LABEL[rag]}
    </span>
  );
}

/** The dispute marker: ▲ reported→calculated when the PM reported greener. */
export function DisputeGap({ p }: { p: CockpitProject }) {
  if (!p.dispute) {
    return <span className="text-[11px] text-[var(--ink4)]">{p.reported === p.calculated ? "agrees" : "—"}</span>;
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-semibold"
      style={{ background: "var(--badbg)", color: "var(--bad)" }}
      title={`Reported ${RAG_LABEL[p.reported]}, calculated ${RAG_LABEL[p.calculated]}`}
    >
      ▲ {p.reported}→{p.calculated}
    </span>
  );
}

export function DimensionSquares({ p }: { p: CockpitProject }) {
  return (
    <span className="inline-flex gap-[3px]" title={DIMENSIONS.map((d) => `${d}: ${RAG_LABEL[p.dims[d]]}`).join(" · ")}>
      {DIMENSIONS.map((d) => {
        const v = p.dims[d];
        return (
          <i
            key={d}
            className="inline-grid h-[18px] w-5 place-items-center rounded text-[10px] font-bold not-italic"
            style={{ background: v === "N" ? "var(--wash2)" : RAG_SOLID[v], color: v === "N" ? "var(--ink4)" : v === "A" ? "#231f20" : "#fff" }}
          >
            {d[0]}
          </i>
        );
      })}
    </span>
  );
}

const GATE: Record<string, { ch: string; bg: string; fg: string; title: string }> = {
  Done: { ch: "✓", bg: "var(--okbg)", fg: "var(--ok)", title: "Complete" },
  InProgress: { ch: "●", bg: "var(--brand-light)", fg: "var(--brand)", title: "In progress" },
  Blocked: { ch: "✕", bg: "var(--badbg)", fg: "var(--bad)", title: "Blocked" },
  NotStarted: { ch: "—", bg: "transparent", fg: "var(--ink4)", title: "Not started" },
};

export function GateChip({ state }: { state: string }) {
  const g = GATE[state] ?? GATE.NotStarted;
  return (
    <span
      className="inline-grid size-[22px] place-items-center rounded-full text-[12px] font-bold"
      style={{ background: g.bg, color: g.fg }}
      title={g.title}
    >
      {g.ch}
    </span>
  );
}

export function Freshness({ days }: { days: number }) {
  const cls = days > 14 ? "var(--bad)" : days > 7 ? "var(--warn)" : "var(--ink4)";
  const label = days > 90 ? "no updates" : `${days}d ago`;
  return <span className="whitespace-nowrap text-[12px]" style={{ color: cls, fontWeight: days > 7 ? 600 : 400 }}>{label}</span>;
}

export function RagBar({ counts }: { counts: { R: number; A: number; G: number; N: number } }) {
  const total = counts.R + counts.A + counts.G + counts.N || 1;
  const segs: [DimRag, number][] = [["R", counts.R], ["A", counts.A], ["G", counts.G], ["N", counts.N]];
  return (
    <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded" role="img" aria-label={`Red ${counts.R}, Amber ${counts.A}, Green ${counts.G}`}>
      {segs.filter(([, n]) => n > 0).map(([k, n]) => (
        <i key={k} className="block" style={{ flex: n / total, background: RAG_SOLID[k] }} title={`${RAG_LABEL[k]} ${n}`} />
      ))}
    </div>
  );
}

export function Tile({
  value,
  label,
  detail,
  hot,
  jump,
  children,
}: {
  value: React.ReactNode;
  label: string;
  detail?: React.ReactNode;
  hot?: boolean;
  jump?: string;
  children?: React.ReactNode;
}) {
  const Cmp = jump ? "button" : "div";
  return (
    <Cmp
      {...(jump ? { "data-jump": jump, type: "button" as const } : {})}
      className="relative flex min-w-0 flex-col gap-1 rounded-xl border p-4 text-left"
      style={{
        background: hot ? "var(--badbg)" : "var(--cardbg)",
        borderColor: hot ? "var(--bad)" : "var(--cardbd)",
      }}
    >
      <span className="text-[28px] font-semibold leading-none tracking-tight" style={{ color: hot ? "var(--bad)" : "var(--qink)" }}>
        {value}
      </span>
      <span className="text-[12px] text-[var(--ink2)]">{label}</span>
      {children}
      {detail && <span className="text-[12px] text-[var(--ink4)]">{detail}</span>}
    </Cmp>
  );
}

/** A project card for the strip (opens the drawer via delegation). */
export function ProjectStripCard({ p }: { p: CockpitProject }) {
  const border = { G: "var(--ok)", A: "var(--warn)", R: "var(--bad)", N: "var(--ink4)" }[p.calculated];
  return (
    <button
      data-open={p.id}
      className="flex min-w-0 flex-col gap-2 rounded-[10px] border p-3 text-left"
      style={{ background: "var(--cardbg)", borderColor: "var(--cardbd)", borderLeft: `4px solid ${border}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <b className="text-[14px] font-semibold leading-tight text-[var(--qink)]">{p.name}</b>
        <RagChip rag={p.calculated} />
      </div>
      <div className="text-[12px] text-[var(--ink2)]">{p.status} · {p.pct}%</div>
      <div className="flex items-center gap-2"><DimensionSquares p={p} /><DisputeGap p={p} /></div>
      <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--ink4)]">
        <span>{p.nextMilestone ? p.nextMilestone.name : "no milestone set"}</span>
        <Freshness days={p.freshnessDays} />
      </div>
    </button>
  );
}

export function RiskList({ risks }: { risks: CockpitProject["risks"] & { project?: string }[] }) {
  if (!risks.length) return <span className="text-[12px] text-[var(--ink4)]">No open risks</span>;
  return (
    <div className="flex flex-col gap-2">
      {risks.map((r, i) => (
        <div key={i} className="grid grid-cols-[auto_1fr_auto] items-start gap-2.5 text-[13px]">
          <span className="mt-1.5 size-2 rounded-full" style={{ background: r.severity === "R" ? "var(--bad)" : "var(--warn)" }} />
          <div><b className="block font-semibold text-[var(--qink)]">{r.title}</b><span className="text-[12px] text-[var(--ink3)]">{r.id} · owner {r.owner}</span></div>
        </div>
      ))}
    </div>
  );
}

export function MarketMatrix({ markets }: { markets: CockpitProject["markets"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: "0 4px" }}>
        <tbody>
          {markets.map((m) => (
            <tr key={m.market}>
              <td className="rounded-l-md px-2.5 py-1.5 text-left text-[12px] font-semibold" style={{ background: "var(--qink)", color: "var(--bg)" }}>
                {m.market} <span className="text-[11px] font-normal opacity-70">{m.pct}%</span>
              </td>
              <td className="rounded-r-md px-2 py-1.5" style={{ background: "var(--wash2)" }}>
                <span className="inline-block h-3 w-9 rounded-full" style={{ background: m.status === "OnTrack" ? "var(--ok)" : m.status === "Overdue" ? "var(--bad)" : "var(--warn)" }} title={m.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 8-week stacked RAG trend, hand-rolled SVG (the repo has no chart lib). */
export function RagTrend({ series, weeks, title }: { series: [number, number, number][]; weeks: string[]; title: string }) {
  const W = 360, H = 150, pl = 26, pr = 8, pt = 22, pb = 22;
  const max = Math.max(4, ...series.map(([g, a, r]) => g + a + r));
  const iw = W - pl - pr, ih = H - pt - pb, bw = iw / (series.length || 1);
  const y = (v: number) => pt + ih - (v / max) * ih;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[440px] overflow-visible" role="img" aria-label={title}>
      <text x={pl} y={12} className="font-semibold" style={{ fill: "var(--qink)", fontSize: 11 }}>{title}</text>
      {[0, Math.round(max / 3), Math.round((2 * max) / 3), max].map((v) => (
        <g key={v}>
          <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} style={{ stroke: "var(--hair)" }} />
          <text x={pl - 6} y={y(v) + 4} textAnchor="end" style={{ fill: "var(--ink4)", fontSize: 11 }}>{v}</text>
        </g>
      ))}
      {series.map((w, i) => {
        const x = pl + i * bw + bw * 0.18, ww = bw * 0.64;
        let acc = 0;
        const parts: [number, string][] = [[w[2], "var(--bad)"], [w[1], "var(--warn)"], [w[0], "var(--ok)"]];
        return (
          <g key={i}>
            {parts.map(([v, fill], k) => {
              if (!v) return null;
              const y1 = y(acc + v), h = y(acc) - y1;
              acc += v;
              return <rect key={k} x={x} y={y1} width={ww} height={Math.max(h - 1, 0)} style={{ fill }} />;
            })}
            <text x={x + ww / 2} y={H - 6} textAnchor="middle" style={{ fill: "var(--ink4)", fontSize: 11 }}>{weeks[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

export const RAG_TOKENS = { RAG_LABEL, RAG_BG, RAG_FG, RAG_SOLID };
