// Milestone D — "Email to executives": the approved digest goes to every address on the
// list as a PDF attachment, the send is stamped on the roll-up and audited, and every
// refusal is explicit — PMs, an unapproved week, an empty list, email off. The mailer and
// the renderer are mocked: this is about the rules, not Chromium or Graph.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createUsers, cleanupFixtureUsers } from "./_users";

const sent: { to: string; subject: string; attachments?: { filename: string; contentType: string; content: Buffer }[] }[] = [];
let emailOn = true;
vi.mock("@/server/mail/mailer", () => ({
  emailEnabled: () => emailOn,
  getMailer: () => ({
    send: async (m: (typeof sent)[number]) => {
      sent.push(m);
      return { ok: !m.to.startsWith("bounce"), adapter: "log" };
    },
  }),
}));
vi.mock("@/server/pdf/render", () => ({
  pdfAvailable: async () => true,
  renderPdf: async () => Buffer.from("%PDF-1.4 stub"),
}));

const { emailReport } = await import("@/server/report-email");
const { approveRollup } = await import("@/server/portfolio-reports");
const { addRecipient } = await import("@/server/rollup-recipients");
const { isoWeekId } = await import("@/lib/iso-week");

const NOW = new Date("2026-10-09T15:00:00Z");
const WEEK = isoWeekId(NOW);

describe("Milestone D — emailReport", () => {
  let rbId: string;
  let head: TenantContext;
  let pm: TenantContext;

  beforeAll(async () => {
    const rb = await prisma.tenant.findUnique({ where: { slug: "riverbank" } });
    if (!rb) throw new Error("Seed required.");
    rbId = rb.id;
    const [h, p] = await createUsers(rbId, 2, "rem");
    head = { tenantId: rbId, userId: h.id, roles: ["HeadOfProjects"] };
    pm = { tenantId: rbId, userId: p.id, roles: ["ProjectManager"] };
    await withTenant(head, (tx) => tx.portfolioReport.deleteMany({ where: { isoWeek: WEEK } }));
  });

  afterAll(async () => {
    await withTenant(head, async (tx) => {
      await tx.portfolioReport.deleteMany({ where: { isoWeek: WEEK } });
      await tx.rollupRecipient.deleteMany({ where: { email: { endsWith: "@fixture.invalid" } } });
      await tx.domainEvent.deleteMany({ where: { type: "rollup.emailed", actorId: head.userId } });
      await tx.notification.deleteMany({ where: { kind: "rollup.approved", createdAt: { gte: new Date(Date.now() - 120_000) } } });
      await tx.auditLog.deleteMany({ where: { actorId: head.userId } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("refuses in order: not the Head, email off, no recipients, not approved — then sends and stamps", async () => {
    await expect(emailReport(pm, { template: "digest", week: WEEK, columns: [] }, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });

    emailOn = false;
    await expect(emailReport(head, { template: "digest", week: WEEK, columns: [] }, NOW)).rejects.toMatchObject({ code: "EMAIL_OFF" });
    emailOn = true;

    await expect(emailReport(head, { template: "digest", week: WEEK, columns: [] }, NOW)).rejects.toMatchObject({ code: "NO_RECIPIENTS" });
    await addRecipient(head, { email: "exec.one@fixture.invalid" });
    await addRecipient(head, { email: "bounce@fixture.invalid" });

    await expect(emailReport(head, { template: "digest", week: WEEK, columns: [] }, NOW)).rejects.toMatchObject({ code: "NOT_APPROVED" });
    expect(sent).toHaveLength(0);

    await approveRollup(head, "Week held; one vendor dependency to watch.", NOW, { acknowledgeUnsent: true });
    const result = await emailReport(head, { template: "digest", week: WEEK, columns: [] }, NOW);
    expect(result).toMatchObject({ recipients: 2, sent: 1, failed: ["bounce@fixture.invalid"], emailedAt: NOW });
    expect(sent.map((m) => m.to).sort()).toEqual(["bounce@fixture.invalid", "exec.one@fixture.invalid"]);
    expect(sent[0]!.subject).toMatch(/^Week \d\d roll-up — /);
    expect(sent[0]!.attachments?.[0]).toMatchObject({ filename: `qubit-rollup-${WEEK}.pdf`, contentType: "application/pdf" });

    const row = await withTenant(head, (tx) => tx.portfolioReport.findUnique({ where: { tenantId_isoWeek: { tenantId: rbId, isoWeek: WEEK } }, select: { emailedAt: true, emailedTo: true } }));
    expect(row).toEqual({ emailedAt: NOW, emailedTo: ["exec.one@fixture.invalid"] });
    const [audit, event] = await Promise.all([
      withTenant(head, (tx) => tx.auditLog.findFirst({ where: { entityType: "portfolio_report", actorId: head.userId, action: "update" }, orderBy: { createdAt: "desc" }, select: { after: true } })),
      withTenant(head, (tx) => tx.domainEvent.findFirst({ where: { type: "rollup.emailed", actorId: head.userId }, select: { payload: true } })),
    ]);
    expect(audit?.after).toMatchObject({ emailedTo: ["exec.one@fixture.invalid"], failed: ["bounce@fixture.invalid"] });
    expect(event?.payload).toMatchObject({ isoWeek: WEEK, recipients: 1, failed: 1 });
  });
});
