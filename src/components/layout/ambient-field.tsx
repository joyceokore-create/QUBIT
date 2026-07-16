// QUBIT App v3 atmosphere — three slow-drifting radial-gradient blobs behind the whole
// app shell. Fixed + pointer-events:none so it never interferes; amb1 is tenant-tinted
// (brand), amb2/amb3 are the fixed QUBIT navy/green. Honours prefers-reduced-motion via the
// global reduce rule. Purely decorative (aria-hidden).
const BLOBS = [
  { style: { top: -260, left: -180, width: 1000, height: 760 }, amb: "--amb1", anim: "drift1 52s ease-in-out infinite alternate" },
  { style: { top: -140, right: -260, width: 1100, height: 820 }, amb: "--amb2", anim: "drift2 67s ease-in-out infinite alternate" },
  { style: { bottom: -320, left: "28%", width: 1200, height: 800 }, amb: "--amb3", anim: "drift3 83s ease-in-out infinite alternate" },
] as const;

export function AmbientField() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden" style={{ opacity: 0.65 }}>
      {BLOBS.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            borderRadius: "50%",
            background: `radial-gradient(closest-side, var(${b.amb}), transparent 70%)`,
            animation: b.anim,
            ...b.style,
          }}
        />
      ))}
    </div>
  );
}
