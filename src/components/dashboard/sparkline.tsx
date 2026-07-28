// Server-rendered SVG sparkline for the dashboard KPI tiles (M1). No client JS — the
// trend is decoration over a real number, so it degrades to nothing, never to fake data.
export function Sparkline({
  points,
  tone = "--brand",
  width = 104,
  height = 26,
}: {
  /** Daily values, oldest → newest. Fewer than 2 points renders an honest empty hint. */
  points: number[];
  /** CSS custom property for the stroke, e.g. "--ok". */
  tone?: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <span className="font-mono text-[8.5px] uppercase tracking-[1px] text-[var(--ink5)]">
        Trend after 2+ nightly snapshots
      </span>
    );
  }

  const pad = 2;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (points.length - 1);
  const y = (v: number) => height - pad - ((v - min) * (height - pad * 2)) / span;
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Trend over ${points.length} days, latest ${last}`}
      className="block"
    >
      <path d={path} fill="none" stroke={`var(${tone})`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(last)} r="2" fill={`var(${tone})`} />
    </svg>
  );
}
