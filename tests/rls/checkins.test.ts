// M2 weekly loop end-to-end: Friday drafts + lead notification, confirm with override
// expiry, the Friday report (confirmed voice vs "unconfirmed — computed status shown"),
// subscriber notification, per-week idempotency, and tenant isolation.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";
import { confirmCheckIn, getCurrentCheckIn } from "@/server/checkins";
import { runJob } from "@/server/jobs";
import { ensureUsers, cleanupFixtureUsers } from "./_users";

const KEY_PREFIX = `checkins-test-${process.pid}`;
let keySeq = 0;
const nextKey = () => `${KEY_PREFIX}:${++keySeq}`;
const WEEK = isoWeekId(new Date());

describe("M2 weekly loop", () => {
  let demoBId: string;
  let riverbankId: string;
  let leadId: string;
  let execId: string;
  let projectId: string;
  let leadCtx: TenantContext;

  beforeAll(async () => {
    const [demoB, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!demoB || !riverbank) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    demoBId = demoB.id;
    riverbankId = riverbank.id;
    const [lead, exec] = await ensureUsers(demoBId, 2);
    leadId = lead.id;
    execId = exec.id;
    leadCtx = { tenantId: demoBId, userId: leadId, roles: ["Member"] };

    await withTenant({ tenantId: demoBId, userId: "test" }, async (tx) => {
      const project = await tx.project.create({
        data: {
          tenantId: demoBId,
          code: `CHK${Date.now() % 100000}`,
          name: "Check-in Loop Fixture",
          type: "Project",
          priority: "High",
          status: "AtRisk",
          leadUserId: leadId,
        },
      });
      projectId = project.id;
      await tx.reportSubscription.upsert({
        where: { tenantId_userId_kind: { tenantId: demoBId, userId: execId, kind: "weekly_report" } },
        create: { tenantId: demoBId, userId: execId, kind: "weekly_report" },
        update: {},
      });
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId: demoBId, userId: "test" }, async (tx) => {
      await tx.checkIn.deleteMany({ where: { isoWeek: WEEK } });
      await tx.sharedReport.deleteMany({ where: { type: "weekly", periodLabel: WEEK } });
      await tx.notification.deleteMany({ where: { kind: { in: ["checkin_ready", "weekly_report"] } } });
      await tx.domainEvent.deleteMany({ where: { type: { in: ["checkin.drafted", "checkin.confirmed", "report.published"] } } });
      await tx.reportSubscription.deleteMany({ where: { userId: execId } });
      await tx.auditLog.deleteMany({ where: { entityType: "check_in" } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    // The Friday jobs loop every tenant — clear riverbank's side too so re-runs are clean.
    await withTenant({ tenantId: riverbankId, userId: "test" }, async (tx) => {
      await tx.checkIn.deleteMany({ where: { isoWeek: WEEK } });
      await tx.sharedReport.deleteMany({ where: { type: "weekly", periodLabel: WEEK } });
      await tx.notification.deleteMany({ where: { kind: { in: ["checkin_ready", "weekly_report"] } } });
      await tx.domainEvent.deleteMany({ where: { type: { in: ["checkin.drafted", "checkin.confirmed", "report.published"] } } });
    });
    await prisma.jobRun.deleteMany({ where: { idempotencyKey: { startsWith: KEY_PREFIX } } });
    await cleanupFixtureUsers(demoBId);
    await prisma.$disconnect();
  });

  it("serves an ephemeral computed draft before anything is persisted", async () => {
    const view = await getCurrentCheckIn(leadCtx, projectId);
    expect(view.id).toBeNull();
    expect(view.status).toBe("Draft");
    expect(view.computedRag).toBe("Amber"); // AtRisk → Amber via the one health engine
    expect(view.lines.length).toBeGreaterThan(0);
  });

  it("friday-checkin-drafts persists drafts and notifies the lead", async () => {
    const result = await runJob("friday-checkin-drafts", nextKey());
    expect(result.status).toBe("Succeeded");

    const row = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.checkIn.findUniqueOrThrow({
        where: { tenantId_projectId_isoWeek: { tenantId: demoBId, projectId, isoWeek: WEEK } },
      }),
    );
    expect(row.status).toBe("Draft");

    // The fixture lead may be the seeded demo project's lead too — target this
    // project's notification precisely rather than whichever fan-out landed first.
    const note = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.notification.findFirst({
        where: { userId: leadId, kind: "checkin_ready", link: `/projects/${projectId}` },
      }),
    );
    expect(note).not.toBeNull();
    expect(note?.message).toContain("Check-in Loop Fixture");
  });

  it("confirm records the narrative, override reason, and a 7-day expiry", async () => {
    const before = Date.now();
    const view = await confirmCheckIn(leadCtx, projectId, {
      narrative: "Vendor slippage contained; recovery plan agreed with QA.",
      ragOverride: "Green",
      overrideReason: "Mitigation lands Monday; risk is priced in.",
    });
    expect(view.status).toBe("Confirmed");
    expect(view.computedRag).toBe("Amber");
    expect(view.effectiveRag).toBe("Green"); // live override wins…
    const ttlDays = (new Date(view.overrideExpiresAt!).getTime() - before) / 86_400_000;
    expect(ttlDays).toBeGreaterThan(6.9);
    expect(ttlDays).toBeLessThan(7.1); // …and expires in ~7 days

    const auditRow = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.auditLog.findFirst({ where: { entityType: "check_in", actorId: leadId } }),
    );
    expect(auditRow).not.toBeNull();
  });

  it("a re-run draft job never clobbers a confirmed check-in", async () => {
    const result = await runJob("friday-checkin-drafts", nextKey());
    expect(result.status).toBe("Succeeded");
    const row = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.checkIn.findUniqueOrThrow({
        where: { tenantId_projectId_isoWeek: { tenantId: demoBId, projectId, isoWeek: WEEK } },
      }),
    );
    expect(row.status).toBe("Confirmed");
    expect(row.narrative).toContain("Vendor slippage contained");
  });

  it("friday-report speaks in the lead's voice when confirmed, marks the rest honestly", async () => {
    const result = await runJob("friday-report", nextKey());
    expect(result.status).toBe("Succeeded");

    const report = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.sharedReport.findFirstOrThrow({ where: { type: "weekly", periodLabel: WEEK } }),
    );
    expect(report.markdown).toContain("Vendor slippage contained"); // confirmed narrative
    expect(report.markdown).toContain("lead override");
    expect(report.markdown).toContain("unconfirmed — computed status shown"); // seeded leadless projects
    expect(report.createdById).toBeNull(); // machine actor

    const note = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.notification.findFirst({ where: { userId: execId, kind: "weekly_report" } }),
    );
    expect(note?.link).toContain("/reports/s/");
  });

  it("publishes at most one weekly report per tenant per ISO week", async () => {
    const again = await runJob("friday-report", nextKey());
    expect(again.status).toBe("Succeeded");
    const fixtureDetail = again.detail["demo-b"] as { skipped?: string };
    expect(fixtureDetail.skipped).toBe("report already published");
    const count = await withTenant({ tenantId: demoBId, userId: "test" }, (tx) =>
      tx.sharedReport.count({ where: { type: "weekly", periodLabel: WEEK } }),
    );
    expect(count).toBe(1);
  });

  it("keeps check-ins tenant-isolated", async () => {
    const crossRead = await withTenant({ tenantId: riverbankId, userId: "test" }, (tx) =>
      tx.checkIn.findMany({ where: { projectId } }),
    );
    expect(crossRead).toHaveLength(0);
    const unscoped = await prisma.checkIn.findMany({ take: 1 });
    expect(unscoped).toHaveLength(0);
  });
});
