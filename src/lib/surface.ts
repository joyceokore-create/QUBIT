// Shared surface + RAG presentation tokens (docs/08-design-system.md). These strings were
// copy-pasted into ~20 files as local `CARD` consts and 10 identical `RAG_TOKEN` maps, so
// a token change meant a 20-file sweep and drift was only a matter of time. One home now.
// Pure strings/maps — safe in server and client components alike.
import type { Rag } from "@/server/health";

/** The standard card surface. Pair with `CARD_BG` for the filled variant. */
export const CARD = "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)]";

/** The glass variant used by the dashboard's floating panels. */
export const CARD_GLASS = `${CARD} backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]`;

/** Inline background for a card — `style={CARD_BG}` (a var, so themes still drive it). */
export const CARD_BG = { background: "var(--cardbg)" } as const;

/** RAG → CSS custom-property name. The one mapping; everything else derives from it. */
export const RAG_TOKEN: Record<string, string> = { Green: "--ok", Amber: "--warn", Red: "--bad" };

/** The token for any RAG-ish string, with a neutral fallback for unknown values. */
export function ragToken(rag: string | null | undefined): string {
  return (rag && RAG_TOKEN[rag]) || "--ink4";
}

/** Chip styling for a RAG value: coloured text on a 10% wash of the same token. */
export function ragChipStyle(rag: string | null | undefined): { color: string; background: string } {
  const tok = ragToken(rag);
  return { color: `var(${tok})`, background: `color-mix(in oklab, var(${tok}) 10%, transparent)` };
}

/** Solid dot/bar fill for a RAG value. */
export function ragFill(rag: string | null | undefined): { background: string } {
  return { background: `var(${ragToken(rag)})` };
}

/** Type-safe variant for callers that already hold a `Rag`. */
export function ragTokenOf(rag: Rag): string {
  return RAG_TOKEN[rag] ?? "--ink4";
}
