import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isHeadOfProjects } from "@/lib/rbac";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekMonday, weekRange } from "@/lib/iso-week";
import { emitDomainEvent } from "@/server/events";
import { emailEnabled, getMailer } from "@/server/mail/mailer";
import { projectReportEmail, rollupEmail } from "@/server/mail/template";
import { buildExport, type ExportRequestInput } from "@/server/pdf/export";
import { getDigestReport } from "@/server/pdf/report-data";
import { pdfAvailable, renderPdf } from "@/server/pdf/render";
import { listRecipients } from "@/server/rollup-recipients";

/**
 * Milestone D — "Email to executives": render the report, attach it, send one email per
 * address on the roll-up list, then record the send. Head-only. The mailer's rule holds —
 * a failed send is reported, never thrown — and nothing is stamped when email is off for
 * the deployment (a 409, not a pretend send: the log adapter would otherwise look like
 * delivery). The digest must be Approved first: executives get the signed record only.
 */

export class ReportEmailError extends Error {
  constructor(
    message: string,
    public code: "FORBIDDEN" | "EMAIL_OFF" | "PDF_UNAVAILABLE" | "NO_RECIPIENTS" | "NOT_APPROVED" | "NOT_FOUND",
  ) {
    super(message);
    this.name = "ReportEmailError";
  }
}

export interface ReportEmailResult {
  recipients: number;
  sent: number;
  failed: string[];
  emailedAt: Date;
}

function appUrl(): string {
  return (process.env.AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export async function emailReport(ctx: TenantContext, input: ExportRequestInput, now = new Date()): Promise<ReportEmailResult> {
  if (!isHeadOfProjects(ctx)) throw new ReportEmailError("Only the Head can email reports to the executive list.", "FORBIDDEN");
  if (!emailEnabled()) throw new ReportEmailError("Email is off for this deployment.", "EMAIL_OFF");
  if (!(await pdfAvailable())) throw new ReportEmailError("PDF rendering is not available on this deployment.", "PDF_UNAVAILABLE");
  const recipients = await listRecipients(ctx);
  if (recipients.length === 0) throw new ReportEmailError("Add at least one recipient to the roll-up list first.", "NO_RECIPIENTS");

  // Data under RLS, then the render, then the sends — nothing below holds a transaction.
  const report = await buildExport(ctx, input, now).catch((e) => {
    throw new ReportEmailError(e instanceof Error ? e.message : "Report not found.", "NOT_FOUND");
  });
  const [sender, tenant] = await Promise.all([
    withTenant(ctx, (tx) => tx.user.findUnique({ where: { id: ctx.userId }, select: { name: true } })),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, brandColor: true } }),
  ]);
  const brand = { tenantName: tenant?.name ?? "QUBIT", brandColor: tenant?.brandColor ?? "#231F20" };
  let mail;
  if (report.kind === "digest") {
    const digest = await getDigestReport(ctx, report.isoWeek, { portfolioId: input.portfolio, now });
    if (!digest) throw new ReportEmailError("No roll-up for that week.", "NOT_FOUND");
    if (digest.status !== "Approved") throw new ReportEmailError("Approve the roll-up before emailing it — executives get the signed record only.", "NOT_APPROVED");
    mail = rollupEmail({
      ...brand,
      isoWeek: report.isoWeek,
      range: weekRange(isoWeekMonday(report.isoWeek)),
      narrative: digest.narrative,
      counts: digest.counts,
      total: digest.total,
      preparedBy: digest.approvedByName ?? "the Head",
      url: `${appUrl()}/reports?week=${report.isoWeek}`,
    });
  } else {
    mail = projectReportEmail({
      ...brand,
      isoWeek: report.isoWeek,
      projectCode: report.project?.code ?? "",
      projectName: report.project?.name ?? "",
      senderName: sender?.name ?? "The Head",
      url: `${appUrl()}/projects/${report.project?.id}?tab=This%20week`,
    });
  }
  const pdf = await renderPdf(report.html, report.spec);
  const attachments = [{ filename: `${report.filenameStem}.pdf`, contentType: "application/pdf", content: pdf }];

  const mailer = getMailer();
  const failed: string[] = [];
  for (const r of recipients) {
    const res = await mailer.send({ to: r.email, subject: mail.subject, html: mail.html, text: mail.text, attachments });
    if (!res.ok) failed.push(r.email);
  }
  const delivered = recipients.map((r) => r.email).filter((e) => !failed.includes(e));
  const emailedAt = now;

  await withTenant(ctx, async (tx) => {
    if (report.kind === "digest") {
      const row = await tx.portfolioReport.findUnique({ where: { tenantId_isoWeek: { tenantId: ctx.tenantId, isoWeek: report.isoWeek } }, select: { id: true, emailedAt: true, emailedTo: true } });
      if (row) {
        await tx.portfolioReport.update({ where: { id: row.id }, data: { emailedAt, emailedTo: delivered } });
        await audit(tx, ctx, {
          action: "update",
          entityType: "portfolio_report",
          entityId: row.id,
          before: { emailedAt: row.emailedAt, emailedTo: row.emailedTo },
          after: { emailedAt, emailedTo: delivered, failed },
        });
        await emitDomainEvent(tx, ctx, { type: "rollup.emailed", entityType: "portfolio_report", entityId: row.id, payload: { isoWeek: report.isoWeek, recipients: delivered.length, failed: failed.length } });
      }
    } else {
      await audit(tx, ctx, {
        action: "update",
        entityType: "project",
        entityId: input.project!,
        after: { reportEmailed: { template: input.template, isoWeek: report.isoWeek, recipients: delivered.length, failed } },
      });
    }
  });

  return { recipients: recipients.length, sent: delivered.length, failed, emailedAt };
}
