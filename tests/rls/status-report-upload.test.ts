// Status-report upload — apply: the PM's projects get a reasoned RAG override + narrative
// draft, the stage lands in the status note, the file is attached per project; a project
// the PM doesn't run is refused per row, an already-sent week is skipped, and nothing
// crosses a tenant. The parser is covered in tests/unit; here the rows arrive reviewed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId, shiftIsoWeek } from "@/lib/iso-week";
import { confirmCheckIn, getCurrentCheckIn } from "@/server/checkins";
import { getProjectCheckpoints, setCheckpointState } from "@/server/checkpoints";
import { addMarkets } from "@/server/markets";
import { createProjectInstance, listProjectInstances } from "@/server/project-instances";
import { composeFromMarkets, draftFromMarkets } from "@/server/market-rollup";
import { getMarketTrack, saveMarketCheckIn } from "@/server/rollout";
import { applyStatusReport, getDeliveryCatalog, getStatusWorkspace, saveStageTerm } from "@/server/status-report-upload";
import { resolveDelivery } from "@/lib/status-report-delivery";
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
  let product: string;
  let marketA: string;

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
    // docs/38 — a product with a gate template, one market and one module, for the slide case.
    await withTenant(pm, async (tx) => {
      marketA = (await tx.orgUnit.findFirstOrThrow({ where: { kind: "Market" }, select: { id: true }, orderBy: { code: "asc" } })).id;
      const templateId = (await tx.checkpointTemplate.findFirst({ select: { id: true } }))?.id ?? null;
      product = (await tx.project.create({ data: { tenantId: rbId, code: "SRU-P", name: "Upload product", type: "Project", priority: "Med", status: "OnTrack", leadUserId: pm.userId, checkpointTemplateId: templateId }, select: { id: true } })).id;
    });
    await addMarkets(pm, product, { orgUnitIds: [marketA] });
    await createProjectInstance(pm, product, { name: "USSD", kind: "module" });
  });

  afterAll(async () => {
    await withTenant(pm, async (tx) => {
      const ids = [mine, mineSent, notMine, product];
      await tx.projectDocument.deleteMany({ where: { projectId: { in: ids } } });
      await tx.checkIn.deleteMany({ where: { projectId: { in: ids } } });
      await tx.notification.deleteMany({ where: { createdAt: { gte: new Date(Date.now() - 120_000) }, link: { contains: "/reports" } } });
      await tx.domainEvent.deleteMany({ where: { entityId: { in: ids } } });
      await tx.stageTerm.deleteMany({ where: { term: "build ongoing" } });
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

    // A past week's report: rows are sent as reviewed (no queue for a closed week), in that week.
    const lastWeek = shiftIsoWeek(WEEK, -1);
    const past = await applyStatusReport(pm, { week: lastWeek, rows: [{ projectId: mine, rag: "Green", stage: "", narrative: "Last week, filed late." }] }, NOW);
    expect(past).toMatchObject([{ projectId: mine, code: "SRU-A", outcome: "sent" }]);
    const lastRow = await withTenant(pm, (tx) => tx.checkIn.findFirst({ where: { projectId: mine, isoWeek: lastWeek }, select: { status: true, narrative: true, submittedToHeadAt: true } }));
    expect(lastRow).toMatchObject({ status: "Confirmed", narrative: "Last week, filed late." });
    expect(lastRow?.submittedToHeadAt).toBeTruthy();
    // This week's draft is untouched by the past-week upload.
    expect((await getCurrentCheckIn(pm, mine, NOW)).narrative).toBe("All stages up to UAT complete; VAPT report due Thursday.");
    await expect(applyStatusReport(pm, { week: shiftIsoWeek(WEEK, 2), rows: [{ projectId: mine, rag: "Green", stage: "", narrative: "Future." }] }, NOW)).rejects.toThrow(/hasn't happened/);
    const foreignDocs = await withTenant({ tenantId: dbId, userId: "seed" }, (tx) => tx.projectDocument.count({ where: { projectId: foreign } }));
    expect(foreignDocs).toBe(0);
  });

  it("writes a slide's gates on every market at product level, module states per market, and a market one-pager as that market's check-in", async () => {
    const catalog = (await getDeliveryCatalog(pm, product))!;
    const market = catalog.markets[0]!;
    const ussd = catalog.modules.find((m) => m.name === "USSD")!;
    const gate = catalog.gates[0];
    // Product slide: first gate complete, USSD live in the market.
    const plan = resolveDelivery(
      { project: "Upload product", gates: gate ? [{ name: gate.name, stateRaw: "COMPLETE", note: "" }] : [], cells: [{ row: market.name, column: "USSD", stateRaw: "LIVE", note: "Rolled out" }] },
      catalog,
    );
    expect(plan.market).toBeNull();
    expect(plan.modules).toHaveLength(1);
    const [productRow] = await applyStatusReport(
      pm,
      {
        rows: [
          {
            projectId: product,
            rag: "Green",
            stage: "",
            narrative: "Product slide.",
            gates: plan.gates.map((g) => ({ checkpointId: g.checkpointId, state: g.to })),
            modules: plan.modules.map((m) => ({ moduleId: m.moduleId, orgUnitId: m.orgUnitId, state: m.to, note: m.note })),
          },
        ],
      },
      NOW,
    );
    expect(productRow).toMatchObject({ outcome: "drafted", problems: [] });
    if (gate) {
      // Product row AND the market's copy both moved (docs/38: at "All" the same gate everywhere).
      expect((await getProjectCheckpoints(pm, product)).rows[0]!.state).toBe("Done");
      expect((await getProjectCheckpoints(pm, product, { orgUnitId: market.orgUnitId })).rows[0]!.state).toBe("Done");
      expect(productRow!.gates).toMatch(/done/);
    }
    const cells = (await listProjectInstances(pm, product, "module")).find((m) => m.id === ussd.id)!.cells;
    expect(cells.find((c) => c.orgUnitId === market.orgUnitId)).toMatchObject({ state: "Live", note: "Rolled out", source: { label: expect.stringMatching(/^Status report · Week \d\d$/), byName: expect.any(String) } });
    expect(productRow!.modules).toBe("1 state updated");
    if (gate) {
      // Provenance on the gate the upload moved — and a hand change clears it.
      expect((await getProjectCheckpoints(pm, product)).rows[0]!.source).toMatchObject({ label: expect.stringMatching(/^Status report/) });
      await setCheckpointState(pm, product, { checkpointId: gate.checkpointId, state: "InProgress" });
      expect((await getProjectCheckpoints(pm, product)).rows[0]!.source).toBeNull();
      await setCheckpointState(pm, product, { checkpointId: gate.checkpointId, state: "Done", overrideReason: "back to done for the test" }, { allMarkets: true });
    }

    // A market one-pager: the market's check-in and its channel states, not the product's draft.
    const [marketRow] = await applyStatusReport(
      pm,
      { rows: [{ projectId: product, markets: [{ orgUnitId: market.orgUnitId, rag: "Amber", narrative: "Market focus and blockers." }], modules: [{ moduleId: ussd.id, orgUnitId: market.orgUnitId, state: "UAT" }] }] },
      NOW,
    );
    expect(marketRow).toMatchObject({ outcome: "none", markets: `1 market check-in saved: ${market.code}`, modules: "1 state updated" });
    expect((await getMarketTrack(pm, product, market.orgUnitId, NOW))?.checkIn).toMatchObject({ narrative: "Market focus and blockers.", rag: "Amber" });
    expect((await getCurrentCheckIn(pm, product, NOW)).narrative).toBe("Product slide."); // untouched
  });

  it("serves the weekly update workspace: my projects with catalog, this week's line, status note and market check-ins", async () => {
    const ws = await getStatusWorkspace(pm, null, NOW);
    expect(ws.isoWeek).toBe(WEEK);
    const codes = ws.projects.map((p) => p.catalog.code);
    expect(codes).toEqual(expect.arrayContaining(["SRU-A", "SRU-B", "SRU-P"]));
    expect(codes).not.toContain("SRU-C"); // not mine
    const prod = ws.projects.find((p) => p.catalog.code === "SRU-P")!;
    expect(prod.catalog.markets).toHaveLength(1);
    expect(prod.markets[0]).toMatchObject({ orgUnitId: prod.catalog.markets[0]!.orgUnitId, rag: "Amber", narrative: "Market focus and blockers." });
    expect(prod.product).toMatchObject({ narrative: "Product slide.", alreadySent: false });
    expect(ws.projects.find((p) => p.catalog.code === "SRU-B")!.product.alreadySent).toBe(true);
  });
  it("applies a workspace row with no line: a market check-in and a market-scoped gate, the product's update untouched", async () => {
    const catalog = (await getDeliveryCatalog(pm, product))!;
    const market = catalog.markets[0]!;
    const gate = catalog.gates[1];
    const [row] = await applyStatusReport(
      pm,
      { rows: [{ projectId: product, markets: [{ orgUnitId: market.orgUnitId, rag: "Red", narrative: "Blocked on TMS." }], gates: gate ? [{ checkpointId: gate.checkpointId, state: "InProgress", orgUnitId: market.orgUnitId }] : [] }] },
      NOW,
    );
    expect(row).toMatchObject({ outcome: "none", markets: `1 market check-in saved: ${market.code}`, problems: [] });
    expect((await getMarketTrack(pm, product, market.orgUnitId, NOW))?.checkIn).toMatchObject({ rag: "Red", narrative: "Blocked on TMS." });
    expect((await getCurrentCheckIn(pm, product, NOW)).narrative).toBe("Product slide.");
    if (gate) {
      expect((await getProjectCheckpoints(pm, product, { orgUnitId: market.orgUnitId })).rows[1]!.state).toBe("InProgress");
      expect((await getProjectCheckpoints(pm, product)).rows[1]!.state).toBe("NotStarted"); // product track untouched
    }
  });
  it("drafts the product line from this week's market check-ins: worst RAG, one clause per market, missing markets named", async () => {
    // Own fixture, whatever earlier tests left on the market: one Amber check-in.
    const mk = (await getDeliveryCatalog(pm, product))!.markets[0]!;
    await saveMarketCheckIn(pm, product, mk.orgUnitId, { narrative: "Market focus and blockers.", rag: "Amber" }, NOW);
    const comp = await composeFromMarkets(pm, product, NOW);
    expect(comp).not.toBeNull();
    expect(comp!.markets).toHaveLength(1);
    expect(comp!.rag).toBe("Amber");
    expect(comp!.narrative).toMatch(/^[A-Z]{2,4}: Market focus and blockers/);
    expect(comp!.missing).toEqual([]);
    // A product without markets composes nothing.
    expect(await composeFromMarkets(pm, mine, NOW)).toBeNull();
    // Saved as the draft (the week isn't sent) with the market RAG as a reasoned override.
    const res = await draftFromMarkets(pm, product, NOW);
    expect(res.saved).toBe(true);
    const ci = await getCurrentCheckIn(pm, product, NOW);
    expect(ci.status).toBe("Draft");
    expect(ci.narrative).toBe(comp!.narrative);
    if (ci.computedRag !== "Amber") expect(ci).toMatchObject({ ragOverride: "Amber", overrideReason: expect.stringMatching(/Worst of 1 market check-in/) });
    await expect(draftFromMarkets(pm, mine, NOW)).rejects.toThrow(/no markets/);
  });

  it("learns a stage phrase tenant-wide, serves it in every catalog, and forgets it on null", async () => {
    expect(await saveStageTerm(pm, { term: "Build ongoing", gateName: "Prototype" })).toEqual({ term: "build ongoing", gateName: "Prototype" });
    expect((await getDeliveryCatalog(other, mine))!.stageTerms).toEqual(expect.arrayContaining([{ term: "build ongoing", gateName: "Prototype" }]));
    // demo-b never sees riverbank's vocabulary.
    const foreignCatalog = await getDeliveryCatalog({ tenantId: dbId, userId: "seed", roles: ["HeadOfProjects"] }, foreign);
    expect(foreignCatalog?.stageTerms ?? []).not.toEqual(expect.arrayContaining([{ term: "build ongoing", gateName: "Prototype" }]));
    expect(await saveStageTerm(pm, { term: "build ongoing", gateName: null })).toEqual({ term: "build ongoing", gateName: null });
    expect((await getDeliveryCatalog(pm, mine))!.stageTerms).not.toEqual(expect.arrayContaining([{ term: "build ongoing", gateName: "Prototype" }]));
  });
});
