/**
 * The casing rule for labels (docs/08 § Design spec v2 › Casing; plan D-F2b). Titles, tabs,
 * nav items, buttons, KPI labels, column headers and filter labels are Title Case; minor
 * words stay lower case unless they are the first or last word; hyphenated words capitalise
 * each part ("Roll-Ups"); proper nouns and acronyms are left as written.
 */
export const MINOR_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "via", "with"]);

function capPart(part: string): string {
  return part ? part.charAt(0).toUpperCase() + part.slice(1) : part;
}

/** Converts a label to Title Case (used by tests and the copy check; source labels are
 * written in Title Case directly, never transformed at runtime). */
export function toTitleCase(label: string): string {
  const words = label.split(" ");
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      const edge = i === 0 || i === words.length - 1;
      if (!edge && MINOR_WORDS.has(lower)) return lower;
      if (/[A-Z]{2,}/.test(w)) return w; // acronyms: MFA, QUBIT, PDF, CSV
      return w.split("-").map(capPart).join("-");
    })
    .join(" ");
}

export function isTitleCase(label: string): boolean {
  return toTitleCase(label) === label;
}
