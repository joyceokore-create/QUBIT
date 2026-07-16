import { Fragment, type ReactNode } from "react";

// Minimal, dependency-free Markdown renderer for Q reports. Handles the subset Q
// emits: h1–h3, bullet lists, bold/italic/inline-code, and paragraphs. Renders React
// nodes directly (no dangerouslySetInnerHTML), so model output can't inject markup.

function inline(text: string, keyPrefix: string): ReactNode[] {
  // Split on **bold**, _italic_, and `code`, keeping delimiters.
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g).filter(Boolean);
  return parts.map((p, i) => {
    const key = `${keyPrefix}-${i}`;
    if (p.startsWith("**") && p.endsWith("**"))
      return (
        <strong key={key} className="font-semibold text-[var(--qink)]">
          {p.slice(2, -2)}
        </strong>
      );
    if (p.startsWith("_") && p.endsWith("_"))
      return (
        <em key={key} className="text-[var(--ink3)]">
          {p.slice(1, -1)}
        </em>
      );
    if (p.startsWith("`") && p.endsWith("`"))
      return (
        <code key={key} className="rounded bg-[var(--w06)] px-1 py-0.5 font-mono text-[12px] text-[var(--ink2)]">
          {p.slice(1, -1)}
        </code>
      );
    return <Fragment key={key}>{p}</Fragment>;
  });
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (!list.length) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={key} className="my-1.5 flex list-disc flex-col gap-1 pl-5 text-[13px] leading-[1.55] text-[var(--ink2)]">
        {items.map((li, i) => (
          <li key={`${key}-${i}`}>{inline(li, `${key}-${i}`)}</li>
        ))}
      </ul>,
    );
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^\s*-\s+/.test(line)) {
      list.push(line.replace(/^\s*-\s+/, ""));
      return;
    }
    flushList(`ul-${i}`);
    if (!line.trim()) return;
    if (line.startsWith("### "))
      blocks.push(
        <h3 key={i} className="mt-3 text-[12px] font-bold uppercase tracking-[0.5px] text-[var(--ink4)]">
          {inline(line.slice(4), `h3-${i}`)}
        </h3>,
      );
    else if (line.startsWith("## "))
      blocks.push(
        <h2 key={i} className="mt-3.5 text-[14px] font-bold text-[var(--qink)]">
          {inline(line.slice(3), `h2-${i}`)}
        </h2>,
      );
    else if (line.startsWith("# "))
      blocks.push(
        <h1 key={i} className="text-[17px] font-bold tracking-[-0.3px] text-[var(--qink)]">
          {inline(line.slice(2), `h1-${i}`)}
        </h1>,
      );
    else
      blocks.push(
        <p key={i} className="text-[13px] leading-[1.55] text-[var(--ink2)]">
          {inline(line, `p-${i}`)}
        </p>,
      );
  });
  flushList("ul-end");

  return <div className="flex flex-col gap-1">{blocks}</div>;
}
