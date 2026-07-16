import type { CSSProperties } from "react";

/**
 * The QUBIT mark — a 2×2 grid of rounded squares (two solid brand, two 45% tint),
 * pure CSS per the design handoff (no image asset). Used in the landing header,
 * sign-in card and topbar at different sizes / brand colours.
 */
export function QubitLogo({
  square = 9,
  gap = 2.5,
  radius = 2.5,
  color = "var(--pbrand)",
}: {
  /** Side length of each of the four squares, in px. */
  square?: number;
  gap?: number;
  radius?: number;
  /** Brand colour (a CSS colour or var reference). Corners are solid; the other two are a 45% tint. */
  color?: string;
}) {
  const tint = `color-mix(in oklab, ${color} 45%, transparent)`;
  const cell: CSSProperties = { borderRadius: radius };
  return (
    <span
      aria-hidden
      style={{
        display: "grid",
        gridTemplateColumns: `${square}px ${square}px`,
        gridTemplateRows: `${square}px ${square}px`,
        gap,
      }}
    >
      <span style={{ ...cell, background: color }} />
      <span style={{ ...cell, background: tint }} />
      <span style={{ ...cell, background: tint }} />
      <span style={{ ...cell, background: color }} />
    </span>
  );
}
