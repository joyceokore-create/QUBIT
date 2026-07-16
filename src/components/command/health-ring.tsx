// Portfolio health ring (design prototype). Inline SVG arc = score%; the numeric
// score is an HTML overlay (not SVG text) per the handoff. Brand-colored, themed.
export function HealthRing({ score, size = 128 }: { score: number; size?: number }) {
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={r} style={{ fill: "none", stroke: "var(--w07)", strokeWidth: 9 }} />
        <circle
          cx="64"
          cy="64"
          r={r}
          transform="rotate(-90 64 64)"
          style={{
            fill: "none",
            stroke: "var(--brand)",
            strokeWidth: 9,
            strokeLinecap: "round",
            strokeDasharray: `${dash} ${circumference}`,
            transition: "stroke-dasharray .8s ease",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <div className="text-[30px] font-bold leading-none text-[var(--qink)]">{score}</div>
        <div className="text-[10px] tracking-[1.5px] text-[var(--ink4)]">HEALTH</div>
      </div>
    </div>
  );
}
