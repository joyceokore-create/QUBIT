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

/**
 * The invite / password-reset email (docs/22 §5). One CTA to the accept link, a plain-text
 * copy of the URL for clients that mangle buttons, and an explicit expiry so a stale link
 * is self-explaining. NEVER contains a password — that is the whole point of M-O3.
 */
export function inviteEmail(opts: {
  name: string;
  tenantName: string;
  brandColor: string;
  acceptUrl: string;
  ttlHours: number;
  purpose?: "invite" | "reset";
}): BrandedEmail {
  const isReset = opts.purpose === "reset";
  const title = isReset ? "Reset your QUBIT password" : "You're invited to QUBIT";
  const lead = isReset
    ? `A password reset was requested for your ${opts.tenantName} account.`
    : `You've been invited to ${opts.tenantName} on QUBIT.`;
  const cta = isReset ? "Set a new password" : "Set your password";
  const expiry = `This link expires in ${opts.ttlHours} hours and can be used once.`;

  const body = [
    `<p style="font-size:14px;line-height:1.6;margin:0 0 16px">Hi ${escapeHtml(opts.name.split(/\s+/)[0] || "there")},</p>`,
    `<p style="font-size:14px;line-height:1.6;margin:0 0 20px">${escapeHtml(lead)} ${escapeHtml(cta)} to get started.</p>`,
    `<p style="margin:0 0 20px"><a href="${escapeHtml(opts.acceptUrl)}" style="display:inline-block;background:${escapeHtml(opts.brandColor)};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px">${escapeHtml(cta)}</a></p>`,
    `<p style="font-size:12px;line-height:1.6;color:#6b6b6b;margin:0 0 8px">Or paste this into your browser:</p>`,
    `<p style="font-size:12px;line-height:1.5;word-break:break-all;margin:0 0 16px"><a href="${escapeHtml(opts.acceptUrl)}" style="color:${escapeHtml(opts.brandColor)}">${escapeHtml(opts.acceptUrl)}</a></p>`,
    `<p style="font-size:12px;line-height:1.6;color:#6b6b6b;margin:0">${escapeHtml(expiry)}</p>`,
  ].join("");

  const text = [
    `Hi ${opts.name.split(/\s+/)[0] || "there"},`,
    "",
    `${lead} ${cta} here:`,
    opts.acceptUrl,
    "",
    expiry,
    "",
    `If you weren't expecting this, you can ignore this email.`,
  ].join("\n");

  return {
    subject: title,
    html: shell({
      tenantName: opts.tenantName,
      brandColor: opts.brandColor,
      title,
      body,
      footer: "If you weren't expecting this, you can ignore this email — the link will expire on its own.",
    }),
    text,
  };
}

/**
 * Milestone A — a PM's nudge to the assignee of a blocked task. Developers and QA may
 * not live in QUBIT, so the primary CTA is the YouTrack issue when the task is mirrored;
 * the QUBIT board link is the secondary door. Says how long it has been blocked and why.
 */
export function nudgeEmail(opts: {
  tenantName: string;
  brandColor: string;
  appUrl: string;
  recipientFirstName: string;
  nudgerName: string;
  projectCode: string;
  projectName: string;
  taskKey: string | null;
  taskTitle: string;
  externalKey: string | null;
  externalUrl: string | null;
  blockedDays: number;
  blockerDescription: string;
  /** App-relative board link, e.g. "/projects/<id>?tab=Board&task=<taskId>". */
  taskLink: string;
}): BrandedEmail {
  const key = opts.externalKey ?? opts.taskKey ?? "task";
  const days = `${opts.blockedDays} day${opts.blockedDays === 1 ? "" : "s"}`;
  const subject = `QUBIT: ${opts.projectCode} · ${key} blocked ${days} — ${opts.nudgerName} needs a word`;
  const qubitUrl = `${opts.appUrl}${opts.taskLink}`;
  const primaryUrl = opts.externalUrl ?? qubitUrl;
  const primaryLabel = opts.externalUrl ? "Open in YouTrack" : "Open in QUBIT";
  const button = (href: string, label: string) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;background:${escapeHtml(opts.brandColor)};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px">${escapeHtml(label)}</a>`;

  const body = [
    `<p style="font-size:14px;line-height:1.6;margin:0 0 16px">Hi ${escapeHtml(opts.recipientFirstName || "there")},</p>`,
    `<p style="font-size:14px;line-height:1.6;margin:0 0 8px">${escapeHtml(opts.nudgerName)} is asking about <strong>${escapeHtml(key)}</strong> — ${escapeHtml(opts.taskTitle)} on ${escapeHtml(opts.projectCode)} · ${escapeHtml(opts.projectName)}.</p>`,
    `<p style="font-size:14px;line-height:1.6;margin:0 0 20px;padding:10px 12px;background:#f8fafc;border-radius:8px"><strong>Blocked for ${escapeHtml(days)}:</strong> ${escapeHtml(opts.blockerDescription)}</p>`,
    `<p style="margin:0 0 12px">${button(primaryUrl, primaryLabel)}</p>`,
    opts.externalUrl
      ? `<p style="font-size:12px;line-height:1.6;margin:0 0 16px"><a href="${escapeHtml(qubitUrl)}" style="color:${escapeHtml(opts.brandColor)}">Open in QUBIT</a></p>`
      : "",
  ].join("");

  const text = [
    `Hi ${opts.recipientFirstName || "there"},`,
    "",
    `${opts.nudgerName} is asking about ${key} — ${opts.taskTitle} on ${opts.projectCode} · ${opts.projectName}.`,
    `Blocked for ${days}: ${opts.blockerDescription}`,
    "",
    `${primaryLabel}: ${primaryUrl}`,
    ...(opts.externalUrl ? [`Open in QUBIT: ${qubitUrl}`] : []),
    "",
    "Your project manager pressed Nudge. Change how you receive nudges under Notifications in QUBIT.",
  ].join("\n");

  return {
    subject,
    html: shell({
      tenantName: opts.tenantName,
      brandColor: opts.brandColor,
      title: `${key} is blocked — ${opts.projectCode}`,
      body,
      footer: "Your project manager pressed Nudge. Change how you receive nudges under Notifications in QUBIT.",
    }),
    text,
  };
}
