// Admin › Integrations — the "paste a code,key list" helper for the bulk YouTrack connect.
// Pure: one line per project, `CODE,KEY` (a comma, tab, semicolon or pipe between them),
// a header row tolerated, blank lines skipped. The caller matches codes to projects and
// reports the ones it doesn't know.

export interface PastedPair {
  line: number;
  code: string;
  key: string;
}

export function parseCodeKeyList(text: string): { pairs: PastedPair[]; errors: { line: number; message: string }[] } {
  const pairs: PastedPair[] = [];
  const errors: { line: number; message: string }[] = [];
  const seen = new Set<string>();
  text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = i + 1;
      const trimmed = raw.trim();
      if (!trimmed) return;
      if (i === 0 && /^(project\s*)?code\b/i.test(trimmed)) return; // header
      const [codeRaw, keyRaw, ...rest] = trimmed.split(/[,\t;|]/).map((f) => f.trim().replace(/^"|"$/g, ""));
      const code = (codeRaw ?? "").toUpperCase();
      const key = keyRaw ?? "";
      if (!code || !key || rest.some(Boolean)) {
        errors.push({ line, message: "Expected exactly two values: project code, YouTrack key." });
        return;
      }
      if (seen.has(code)) {
        errors.push({ line, message: `${code} appears twice.` });
        return;
      }
      seen.add(code);
      pairs.push({ line, code, key });
    });
  return { pairs, errors };
}
