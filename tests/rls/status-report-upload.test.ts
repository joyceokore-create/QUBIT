// Status-report upload — apply: the PM's projects get a reasoned RAG override + narrative
// draft, the stage lands in the status note, the file is attached per project; a project
// the PM doesn't run is refused per row, an already-sent week is skipped, and nothing
// crosses a tenant. The parser is covered in tests/unit; here the rows arrive reviewed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";
import { confirmCheckIn, getCurrentCheckIn } from "@/server/checkins";
import { applyStatusReport } from "@/server/status-report-upload";
import { createUsers, cleanupFixtureUsers } from "./_users";

const NOW = new Date("2026-10-07T10:00:00Z");
const WEEK = isoWeekId(NOW);

describe("status-report upload — apply", () => {
  let rbId: string;
  let dbId: string;
  let pm: TenantContext;
  let other: TenantContext;
  let mine: string;
  let mineSent: string;
  let notMine: string;
  let foreign: string;

  beforeAll(async () => {
    const [rb, db] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [p, o] = await createUsers(rbId, 2, "sru");
    pm = { tenantId: rbId, userId: p.id, roles: ["ProjectManager"] };
    other = { tenantId: rbId, userId: o.id, roles: ["ProjectManager"] };
    const mk = (ctx: TenantContext, code: string, lead: string | null) =>
      withTenant(ctx, (tx) => tx.project.create({ data: { tenantId: ctx.tenantId, code, name: `Upload ${code}`, type: "Project", priority: "Med", status: "OnTrack", leadUserId: lead }, select: { id: true } })).then((x) => x.id);
    [mine, mineSent, notMine] = await Promise.all([mk(pm, "SRU-A", pm.userId), mk(pm, "SRU-B", pm.userId), mk(pm, "SRU-C", other.userId)]);
    foreign = await mk({ tenantId: dbId, userId: "seed", roles: ["HeadOfProjects"] }, "SRU-X", null);
    await confirmCheckIn(pm, mineSent, { narrative: "Already sent this week." }, NOW);
  });

  afterAll(async () => {
    await withTenant(pm, async (tx) => {
      const ids = [mine, mineSent, notMine];
      await tx.projectDocument.deleteMany({ where: { projectId: { in: ids } } });
      await tx.checkIn.deleteMany({ where: { projectId: { in: ids } } });
      await tx.notification.deleteMany({ where: { createdAt: { gte: new Date(Date.now() - 120_000) }, link: { contains: "/reports" } } });
      await tx.domainEvent.deleteMany({ where: { entityId: { in: ids } } });
      await tx.auditLog.deleteMany({ where: { actorId: { in: [pm.userId, other.userId] } } });
      await tx.project.deleteMany({ where: { id: { in: ids } } });
    });
    await withTenant({ tenantId: dbId, userId: "seed" }, (tx) => tx.project.deleteMany({ where: { id: foreign } }));
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("fills my draft with a reasoned override, status note and attachment; refuses / skips the rest per row", async () => {
    const out = await applyStatusReport(
      pm,
      {
        preparedBy: "Fixture PM",
        reportDate: "7 October 2026",
        rows: [
          { projectId: mine, rag: "Amber", stage: "UAT / Pilot Readiness (VAPT in progress)", narrative: "All stages up to UAT complete; VAPT report due Thursday." },
          { projectId: mineSent, rag: "Green", stage: "Pilot", narrative: "Live." },
          { projectId: notMine, rag: "Red", stage: "", narrative: "Not my project." },
          { projectId: foreign, rag: "Green", stage: "", narrative: "Other tenant." },
        ],
        file: { name: "status.docx", format: "docx", base64: Buffer.from("PK fixture").toString("base64") },
      },
      NOW,
    );
    expect(out).toMatchObject([
      { projectId: mine, code: "SRU-A", outcome: "drafted", attached: true },
      { projectId: mineSent, code: "SRU-B", outcome: "skipped" },
      { projectId: notMine, code: "SRU-C", outcome: "error", message: expect.stringContaining("don't run") },
      { projectId: foreign, code: "?", outcome: "error" },
    ]);

    const ci = await getCurrentCheckIn(pm, mine, NOW);
    expect(ci).toMatchObject({ status: "Draft", narrative: "All stages up to UAT complete; VAPT report due Thursday.", ragOverride: "Amber" });
    expect(ci.overrideReason).toMatch(/status report uploaded .* \(prepared by Fixture PM\)/);
    const [project, docs] = await withTenant(pm, (tx) =>
      Promise.all([
        tx.project.findUniqueOrThrow({ where: { id: mine }, select: { statusNote: true } }),
        tx.projectDocument.findMany({ where: { projectId: mine }, select: { title: true, kind: true, format: true, fileData: true } }),
      ]),
    );
    expect(project.statusNote).toBe("UAT / Pilot Readiness (VAPT in progress)");
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ title: `Status report · Week ${WEEK.split("-W")[1]} · Fixture PM`, kind: "Other", format: "docx" });
    expect(Buffer.from(docs[0]!.fileData!, "base64").toString()).toBe("PK fixture");

    // The already-sent project was left exactly as sent; the foreign tenant has nothing.
    expect((await getCurrentCheckIn(pm, mineSent, NOW)).narrative).toBe("Already sent this week.");

    // Recall by upload: a row marked "resend" replaces the sent week and sends it again.
    const again = await applyStatusReport(pm, { rows: [{ projectId: mineSent, rag: "Red", stage: "", narrative: "Replaced from the new report.", resend: true }] }, NOW);
    expect(again).toMatchObject([{ projectId: mineSent, code: "SRU-B", outcome: "resent" }]);
    const resent = await getCurrentCheckIn(pm, mineSent, NOW);
    expect(resent).toMatchObject({ status: "Confirmed", narrative: "Replaced from the new report.", ragOverride: "Red" });
    expect(resent.submittedToHeadAt).toBeTruthy();
    const foreignDocs = await withTenant({ tenantId: dbId, userId: "seed" }, (tx) => tx.projectDocument.count({ where: { projectId: foreign } }));
    expect(foreignDocs).toBe(0);
  });
});
