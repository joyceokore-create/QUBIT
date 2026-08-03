/**
 * Branded email templates (docs/16 §8). Tenant-themed, but deliberately plain: email
 * clients are hostile to modern CSS, so this is table-free, inline-styled HTML with a
 * real plain-text alternative rather than a design-system port.
 *
 * Every template takes the tenant's brand colour so Riverbank reads red (and any other tenant its own colour),
 * exactly like the app (docs/08 hard rule — theming is per tenant, never hardcoded).
 */

export interface BrandedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface DigestItem {
  message: string;
  link: string | null;
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function shell(opts: { tenantName: string; brandColor: string; title: string; body: string; footer: string }): string {
  return [
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#231F20;max-width:560px;margin:0 auto;padding:24px">`,
    `<div style="border-left:4px solid ${escapeHtml(opts.brandColor)};padding-left:12px;margin-bottom:20px">`,
    `<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6b6b6b">${escapeHtml(opts.tenantName)} · QUBIT</div>`,
    `<div style="font-size:20px;font-weight:700;margin-top:4px">${escapeHtml(opts.title)}</div>`,
    `</div>`,
    opts.body,
    `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e6e6e6;font-size:11px;color:#8a8a8a">${escapeHtml(opts.footer)}</div>`,
    `</div>`,
  ].join("");
}

/** The daily digest — one email holding everything that happened, not one per event. */
export function digestEmail(opts: {
  tenantName: string;
  brandColor: string;
  firstName: string;
  items: DigestItem[];
  appUrl: string;
}): BrandedEmail {
  const count = opts.items.length;
  const subject = `QUBIT: ${count} update${count === 1 ? "" : "s"} for you`;
  const rows = opts.items
    .map((i) => {
      const text = escapeHtml(i.message);
      const line = i.link ? `<a href="${escapeHtml(opts.appUrl + i.link)}" style="color:${escapeHtml(opts.brandColor)};text-decoration:none">${text}</a>` : text;
      return `<li style="margin-bottom:8px;line-height:1.5">${line}</li>`;
    })
    .join("");
  const html = shell({
    tenantName: opts.tenantName,
    brandColor: opts.brandColor,
    title: `Good day, ${opts.firstName}`,
    body: `<ul style="padding-left:18px;margin:0;font-size:14px">${rows}</ul>`,
    footer: "You are getting one digest instead of an email per event. Change this under Notifications in QUBIT.",
  });
  const text = [
    `${opts.tenantName} · QUBIT`,
    `Good day, ${opts.firstName}`,
    "",
    ...opts.items.map((i) => `- ${i.message}${i.link ? ` (${opts.appUrl}${i.link})` : ""}`),
    "",
    "You are getting one digest instead of an email per event. Change this under Notifications in QUBIT.",
  ].join("\n");
  return { subject, html, text };
}

/** The Friday report notification — a link, not a copy of the report (docs/17 §6). */
export function weeklyReportEmail(opts: {
  tenantName: string;
  brandColor: string;
  isoWeek: string;
  confirmed: number;
  projects: number;
  url: string;
}): BrandedEmail {
  const subject = `QUBIT weekly delivery report — ${opts.isoWeek}`;
  const body = [
    `<p style="font-size:14px;line-height:1.6;margin:0 0 16px">`,
    `${opts.confirmed} of ${opts.projects} check-ins were confirmed this week.`,
    `</p>`,
    `<a href="${escapeHtml(opts.url)}" style="display:inline-block;background:${escapeHtml(opts.brandColor)};color:#fff;padding:10px 18px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none">Read the report</a>`,
  ].join("");
  const html = shell({
    tenantName: opts.tenantName,
    brandColor: opts.brandColor,
    title: `Weekly delivery report · ${opts.isoWeek}`,
    body,
    footer: "The dashboard does summaries; the report does depth.",
  });
  const text = [
    `${opts.tenantName} · QUBIT weekly delivery report — ${opts.isoWeek}`,
    "",
    `${opts.confirmed} of ${opts.projects} check-ins were confirmed this week.`,
    `Read it: ${opts.url}`,
  ].join("\n");
  return { subject, html, text };
}
