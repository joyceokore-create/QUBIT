// Client-safe helpers to turn a Q report (Markdown) into downloadable artifacts. No server
// imports — used by the reports centre and the shared-report view for .md / .html download.

/** Kebab-case slug for filenames, e.g. "Atlas migration — weekly report" → "atlas-migration-weekly-report". */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "report"
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Inline: **bold**, _italic_, `code`. Escape first, then apply — so model text can't inject markup.
function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:)]|$)/g, "$1<em>$2</em>");
}

/** Render the Markdown subset Q emits (h1–h3, bullet lists, bold/italic/code, paragraphs) to an HTML body fragment. */
export function markdownToHtmlBody(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*-\s+/.test(line)) {
      list.push(line.replace(/^\s*-\s+/, ""));
      continue;
    }
    flush();
    if (!line.trim()) continue;
    if (line.startsWith("### ")) out.push(`<h3>${inline(line.slice(4))}</h3>`);
    else if (line.startsWith("## ")) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.startsWith("# ")) out.push(`<h1>${inline(line.slice(2))}</h1>`);
    else out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join("\n");
}

/** Self-contained, print-ready HTML document — opens cleanly in a browser and "Save as PDF". */
export function markdownToHtmlDoc(markdown: string, meta: { title: string; footer?: string }): string {
  const body = markdownToHtmlBody(markdown);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(meta.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1c22; background: #fff; margin: 0; }
  main { max-width: 760px; margin: 0 auto; padding: 48px 32px 64px; }
  h1 { font-size: 26px; letter-spacing: -0.4px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 26px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #e6e8ee; }
  h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7180; margin: 18px 0 4px; }
  p { margin: 6px 0; }
  ul { margin: 6px 0; padding-left: 22px; }
  li { margin: 3px 0; }
  em { color: #6b7180; }
  code { background: #f2f3f7; border-radius: 4px; padding: 1px 5px; font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
  strong { font-weight: 650; }
  footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e6e8ee; color: #9096a3; font-size: 12px; }
  @media print { main { padding: 0; max-width: none; } }
</style>
</head>
<body>
<main>
${body}
${meta.footer ? `<footer>${escapeHtml(meta.footer)}</footer>` : ""}
</main>
</body>
</html>`;
}

/** Trigger a client-side download of `content` as a file. */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
