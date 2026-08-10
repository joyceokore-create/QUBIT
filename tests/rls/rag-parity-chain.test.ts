// docs/37 Part 3 §2, the last outstanding Wave C item — "one health engine, ENFORCED"
// extended across the reporting chain. health-parity.test.ts pins dashboard === Q; this
// pins the surfaces a PM's override actually travels through:
//
//   pipeline rows (the estate: dashboard + /projects + portfolio pages)
//   === the Head's roll-up rows
//   === the roll-up CSV export
//
// The bug this exists to prevent is T5: a PM overrides a check-in to Red and the exec
// dashboard keeps showing Green because a surface read `Project.status` instead of the
// week's effectiveRag. Wave C fixed the read paths; without this test nothing stops the
// next surface from growing its own classification again.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { confirmCheckIn, submitCheckInToHead } from "@/server/checkins";
import { getPortfolioSections } from "@/server/pipeline";
import { approveRollup, buildRollup, getRollupWeek } from "@/server/portfolio-reports";
import { rollupCsv } from "@/lib/report-csv";
import { createUsers, cleanupFixtureUsers } from "./_users";

// A far-future week of its own, so this suite can never fight the live one.
const NOW = new Date("2027-09-08T09:00:00.000Z"); // 2027-W36
const WEEK = "2027-W36";

/** Pull one project's DISPLAY RAG out of the pipeline sections — the estate renders it
 * from `chips.health`, which is where Wave C put the override-aware value. */
function ragFromSections(data: Awaited<ReturnType<typeof getPortfolioSections>>, code: string): string | null {
  for (const section of data.sections) {
    for (const group of section.pipeline.groups) {
      const row = group.rows.find((r) => r.code === code);
      if (row) return row.chips.health;
    }
  }
  return null;
}

describe("RAG parity across the reporting chain", () => {
  let rbId: string;
  let headCtx: TenantContext;
  let projectId: string;

  beforeAll(async () => {
    const rb = await prisma.tenant.findUnique({ where: { slug: "riverbank" } });
    if (!rb) throw new Error("Seed required.");
    rbId = rb.id;
    const [head] = await createUsers(rbId, 1, "par");
    headCtx = { tenantId: rbId, userId: head.id, roles: ["HeadOfProjects"] };

    projectId = (
      await withTenant(headCtx, (tx) =>
        tx.project.create({
          data: {
            tenantId: rbId, code: "PAR1", name: "parity fixture", type: "Project",
            // Typed status says HEALTHY on purpose: the override must beat it everywhere.
            priority: "Med", status: "OnTrack", leadUserId: head.id,
          },
          select: { id: true },
        }),
      )
    ).id;
  });

  afterAll(async () => {
    await withTenant(headCtx, async (tx) => {
      await tx.portfolioReport.deleteMany({ where: { isoWeek: WEEK } });
      await tx.checkIn.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("a PM's RED override reaches the estate, the roll-up and the CSV — not just the check-in", async () => {
    // The project's typed status is OnTrack, so every surface would read Green if any of
    // them still classified from `Project.status`.
    await confirmCheckIn(
      headCtx,
      projectId,
      {
        narrative: "Vendor pulled the integration window; calling it red.",
        ragOverride: "Red",
        overrideReason: "Vendor slipped the integration window",
      },
      NOW,
    );

    // 1. The estate (pipeline rows feed the dashboard, /projects and portfolio pages).
    const sections = await getPortfolioSections(headCtx, NOW);
    expect(ragFromSections(sections, "PAR1")).toBe("Red");

    // 2. The Head's roll-up.
    const draft = await buildRollup(headCtx, NOW);
    const row = draft.rows.find((r) => r.code === "PAR1")!;
    expect(row.rag).toBe("Red");

    // 3. The CSV the Head hands to an executive. Sending first is not ceremony: since
    // DM1.73 (T7) approveRollup REFUSES a roll-up holding never-sent check-ins, which is
    // exactly the guarantee that used to be missing — walking the real chain here proves
    // it still holds.
    await submitCheckInToHead(headCtx, projectId, NOW);
    await buildRollup(headCtx, NOW);
    await approveRollup(headCtx, "Week carried one red project.", NOW);
    const signed = await getRollupWeek(headCtx, WEEK);
    const csv = rollupCsv(WEEK, signed!.rows);
    const line = csv.split("\n").find((l) => l.includes("PAR1"))!;
    expect(line).toContain("Red");
  });

  it("the typed status alone never contradicts the confirmed week", async () => {
    // Flip the typed status to Overdue while the confirmed override says Red: the answer
    // must stay Red (the override is the human's call for this week), and — the point —
    // it must be the SAME answer on every surface rather than each picking an input.
    await withTenant(headCtx, (tx) => tx.project.update({ where: { id: projectId }, data: { status: "Overdue" } }));

    const sections = await getPortfolioSections(headCtx, NOW);
    const estate = ragFromSections(sections, "PAR1");
    const rollup = (await getRollupWeek(headCtx, WEEK))!.rows.find((r) => r.code === "PAR1")!.rag;
    expect(estate).toBe(rollup);
  });
});
