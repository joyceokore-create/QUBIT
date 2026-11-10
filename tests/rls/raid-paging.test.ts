// UX5 (L4) — Risks & Issues page, search and filter on the server. Proves the paged list
// functions return the right slice and total, filters narrow, search reaches rows beyond
// page 1, an out-of-range page clamps, the Gap report filter agrees with getGapReport, and
// — the non-negotiable — tenant B's rows never appear in Riverbank's page and vice versa.
// Requires a migrated, seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { listRisksPage } from "@/server/risks";
import { listIssuesPage } from "@/server/issues";
import { getGapReport, raidFacets, raidTabCounts } from "@/server/raid";

const PREFIX = "Paged risk fixture";
const ISSUE_PREFIX = "Paged issue fixture";
const NEEDLE = "Paged risk fixture needle qx7";

describe("UX5 server-paged Risks & Issues", () => {
  let rb: TenantContext;
  let b: TenantContext;
  let rbProjectId: string;
  let rbProjectCode: string;
  let needleId: string;
  const rbIds: string[] = [];
  const bIds: string[] = [];
  const ownerA = randomUUID(); // synthetic owner ids — bare strings, no user rows needed
  const ownerB = randomUUID();

  async function cleanup() {
    for (const ctx of [rb, b]) {
      if (!ctx) continue;
      await withTenant(ctx, async (tx) => {
        await tx.issue.deleteMany({ where: { title: { startsWith: ISSUE_PREFIX } } });
        await tx.risk.deleteMany({ where: { title: { startsWith: PREFIX } } });
        await tx.project.deleteMany({ where: { code: "PRF1" } });
      });
    }
  }

  beforeAll(async () => {
    const [rbT, bT] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rbT || !bT) throw new Error("Seed required.");
    rb = { tenantId: rbT.id, userId: randomUUID(), roles: ["PlatformSuperAdmin"] };
    b = { tenantId: bT.id, userId: randomUUID(), roles: ["PlatformSuperAdmin"] };
    await cleanup();

    // The needle goes in first, in its own transaction, so it is the OLDEST fixture and
    // sorts onto the last page (newest first).
    needleId = (
      await withTenant(rb, (tx) =>
        tx.risk.create({
          data: { tenantId: rb.tenantId, title: NEEDLE, probability: 1, impact: 1, status: "Open", createdAt: new Date(Date.now() - 60_000) },
          select: { id: true },
        }),
      )
    ).id;
    rbIds.push(needleId);

    const project = await withTenant(rb, (tx) =>
      tx.project.create({
        data: { tenantId: rb.tenantId, code: "PRF1", name: "Paged fixture project", type: "Project", priority: "Med", status: "OnTrack" },
        select: { id: true, code: true },
      }),
    );
    rbProjectId = project.id;
    rbProjectCode = project.code;

    // 12 more Riverbank risks: 4 Critical (5×5) on the fixture project owned by ownerA,
    // 8 Low (1×2) with no project; 3 of them Monitoring.
    await withTenant(rb, async (tx) => {
      for (let i = 1; i <= 12; i++) {
        const critical = i <= 4;
        const r = await tx.risk.create({
          data: {
            tenantId: rb.tenantId,
            title: `${PREFIX} ${String(i).padStart(2, "0")}`,
            probability: critical ? 5 : 1,
            impact: critical ? 5 : 2,
            status: i >= 10 ? "Monitoring" : "Open",
            projectId: critical ? rbProjectId : null,
            ownerId: critical ? ownerA : null,
            mitigation: critical ? "Synthetic mitigation" : null,
            createdAt: new Date(Date.now() - (12 - i) * 1000),
          },
          select: { id: true },
        });
        rbIds.push(r.id);
      }
    });

    // Tenant B: same title prefix and severity, so only RLS keeps them apart.
    await withTenant(b, async (tx) => {
      for (let i = 1; i <= 3; i++) {
        const r = await tx.risk.create({
          data: { tenantId: b.tenantId, title: `${PREFIX} B${i}`, probability: 5, impact: 5, status: "Open", ownerId: ownerB },
          select: { id: true },
        });
        bIds.push(r.id);
      }
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("pages: each slice is the right part of the full list, with the right total", async () => {
    const all = await listRisksPage(rb, { q: PREFIX, size: 100 });
    expect(all.info.total).toBe(13);
    expect(all.rows.map((r) => r.id).sort()).toEqual([...rbIds].sort());

    const pages = await Promise.all([1, 2, 3].map((page) => listRisksPage(rb, { q: PREFIX, page, size: 5 })));
    expect(pages.map((p) => p.rows.length)).toEqual([5, 5, 3]);
    expect(pages.flatMap((p) => p.rows.map((r) => r.id))).toEqual(all.rows.map((r) => r.id));
    expect(pages[1].info).toMatchObject({ page: 2, size: 5, total: 13, pageCount: 3, from: 6, to: 10 });
  });

  it("an out-of-range page clamps to the last page", async () => {
    const last = await listRisksPage(rb, { q: PREFIX, page: 3, size: 5 });
    const far = await listRisksPage(rb, { q: PREFIX, page: 99, size: 5 });
    expect(far.info).toMatchObject({ page: 3, pageCount: 3, from: 11, to: 13 });
    expect(far.rows.map((r) => r.id)).toEqual(last.rows.map((r) => r.id));
  });

  it("filters narrow: severity (heat bucket), project, owner, status, and 'none'", async () => {
    const crit = await listRisksPage(rb, { q: PREFIX, severity: "Critical" });
    expect(crit.info.total).toBe(4);
    expect(crit.rows.every((r) => r.probability * r.impact >= 16)).toBe(true);

    expect((await listRisksPage(rb, { q: PREFIX, projectId: rbProjectId })).info.total).toBe(4);
    expect((await listRisksPage(rb, { q: PREFIX, projectId: "none" })).info.total).toBe(9);
    expect((await listRisksPage(rb, { q: PREFIX, ownerId: ownerA })).info.total).toBe(4);
    expect((await listRisksPage(rb, { q: PREFIX, ownerId: "none" })).info.total).toBe(9);
    expect((await listRisksPage(rb, { q: PREFIX, status: "Monitoring" })).info.total).toBe(3);
    expect((await listRisksPage(rb, { q: PREFIX, severity: "Low", status: "Monitoring" })).info.total).toBe(3);
  });

  it("search covers every row, not just page 1 (title, mitigation, project code)", async () => {
    const page1 = await listRisksPage(rb, { q: PREFIX, page: 1, size: 5 });
    expect(page1.rows.some((r) => r.id === needleId)).toBe(false);

    const hit = await listRisksPage(rb, { q: "needle QX7", size: 5 });
    expect(hit.info.total).toBe(1);
    expect(hit.rows[0].id).toBe(needleId);

    expect((await listRisksPage(rb, { q: "synthetic MITIGATION" })).rows.filter((r) => rbIds.includes(r.id))).toHaveLength(4);
    expect((await listRisksPage(rb, { q: rbProjectCode, size: 100 })).rows.filter((r) => rbIds.includes(r.id))).toHaveLength(4);
  });

  it("RLS: tenant B's risks never appear in Riverbank's page, and vice versa", async () => {
    const rbPage = await listRisksPage(rb, { q: PREFIX, size: 100 });
    expect(rbPage.rows.some((r) => bIds.includes(r.id))).toBe(false);
    expect(rbPage.info.total).toBe(13);

    const bPage = await listRisksPage(b, { q: PREFIX, size: 100 });
    expect(bPage.rows.map((r) => r.id).sort()).toEqual([...bIds].sort());
    expect(bPage.rows.some((r) => rbIds.includes(r.id))).toBe(false);

    // Even with tenant B's own owner id as the filter, Riverbank sees nothing of B's.
    expect((await listRisksPage(rb, { ownerId: ownerB })).info.total).toBe(0);
    expect((await listRisksPage(b, { projectId: rbProjectId })).info.total).toBe(0);

    const rbFacets = await raidFacets(rb, "risks");
    expect(rbFacets.projects.some((p) => p.id === rbProjectId)).toBe(true);
    const bFacets = await raidFacets(b, "risks");
    expect(bFacets.projects.some((p) => p.id === rbProjectId)).toBe(false);
  });

  it("rejects params outside the allow-list (page size capped at 100)", async () => {
    await expect(listRisksPage(rb, { size: 500 })).rejects.toThrow();
    await expect(listRisksPage(rb, { status: "Bogus" })).rejects.toThrow();
    await expect(listRisksPage(rb, { projectId: "x'; drop table risk;--" })).rejects.toThrow();
  });

  it("the Gap report filter agrees with getGapReport, and issues page under RLS", async () => {
    const [traced, unmitigated] = await withTenant(rb, (tx) =>
      Promise.all([
        tx.risk.create({
          data: { tenantId: rb.tenantId, title: `${PREFIX} traced`, probability: 2, impact: 2, status: "Closed", ownerId: ownerA, mitigation: "Owned and mitigated" },
          select: { id: true },
        }),
        tx.risk.create({
          data: { tenantId: rb.tenantId, title: `${PREFIX} unmitigated`, probability: 2, impact: 2, status: "Closed", ownerId: ownerA, mitigation: "" },
          select: { id: true },
        }),
      ]),
    );
    const issueIds = await withTenant(rb, async (tx) => {
      const base = { tenantId: rb.tenantId, severity: "High", status: "Open" };
      const a = await tx.issue.create({ data: { ...base, title: `${ISSUE_PREFIX} no origin` }, select: { id: true } });
      const t = await tx.issue.create({ data: { ...base, title: `${ISSUE_PREFIX} traced`, originRiskId: traced.id }, select: { id: true } });
      const u = await tx.issue.create({ data: { ...base, title: `${ISSUE_PREFIX} unmitigated`, originRiskId: unmitigated.id }, select: { id: true } });
      return { a: a.id, t: t.id, u: u.id };
    });
    const bIssue = await withTenant(b, (tx) =>
      tx.issue.create({ data: { tenantId: b.tenantId, title: `${ISSUE_PREFIX} B`, severity: "High", status: "Open" }, select: { id: true } }),
    );

    const issues = await listIssuesPage(rb, { q: ISSUE_PREFIX, size: 100 });
    expect(issues.info.total).toBe(3);
    expect(issues.rows.some((r) => r.id === bIssue.id)).toBe(false);

    const gaps = await listIssuesPage(rb, { q: ISSUE_PREFIX, gap: true, size: 100 });
    expect(gaps.rows.map((r) => r.id).sort()).toEqual([issueIds.a, issueIds.u].sort());
    expect(Object.fromEntries(gaps.rows.map((r) => [r.id, r.gapReason]))).toEqual({
      [issueIds.a]: "no_origin_risk",
      [issueIds.u]: "risk_unowned_or_unmitigated",
    });

    // Parity with the derived report, on these fixtures.
    const report = await getGapReport(rb);
    const fixtureIds = new Set(Object.values(issueIds));
    expect(report.items.filter((i) => fixtureIds.has(i.issueId)).map((i) => i.issueId).sort()).toEqual(gaps.rows.map((r) => r.id).sort());

    // Searching by origin risk title reaches the issue.
    expect((await listIssuesPage(rb, { q: `${PREFIX} unmitigated` })).rows.map((r) => r.id)).toEqual([issueIds.u]);

    // B sees only its own issue; Riverbank's counts don't include it.
    const bIssues = await listIssuesPage(b, { q: ISSUE_PREFIX, size: 100 });
    expect(bIssues.rows.map((r) => r.id)).toEqual([bIssue.id]);
    const counts = await raidTabCounts(rb, true);
    expect(counts.gaps).toBe(report.gapCount);
    expect(counts.issues).toBe(report.totalIssues);
  });
});
