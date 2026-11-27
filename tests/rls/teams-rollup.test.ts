// @vitest-environment node
// Summary delivery — Teams: connecting tests the webhook first and stores it encrypted (the
// URL is never returned); only the Head posts, only an approved week, with the summary and
// status spread but no PM names; a Teams failure is recorded, never thrown; no redirect is
// followed; another tenant sees nothing. PowerPoint: the roll-up deck needs reports:read.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { connectTeams, disconnectTeams, getTeamsStatus, postRollupToTeams, teamsConnected } from "@/server/integrations/teams";
import { IntegrationError } from "@/server/integrations/youtrack";
import { buildDigestDeckExport, ExportError } from "@/server/pdf/export";
import { createUsers, cleanupFixtureUsers } from "./_users";

const WEBHOOK = "https://contoso.webhook.office.com/webhookb2/test-only/IncomingWebhook/abc/def";
const WEEK = "2025-W02";

function stubTeams(status = 200) {
  const posts: { url: string; body: string; redirect: RequestRedirect | undefined }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    posts.push({ url: String(input), body: String(init?.body), redirect: init?.redirect });
    return new Response(status === 200 ? "1" : "boom", { status });
  });
  return posts;
}

describe("summary delivery — Teams and PowerPoint", () => {
  let rbId: string;
  let dbId: string;
  let head: TenantContext;
  let pm: TenantContext;
  let reportId: string;
  const users: string[] = [];

  beforeAll(async () => {
    const [rb, db] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [h, p] = await createUsers(rbId, 2, "tms");
    users.push(h.id, p.id);
    head = { tenantId: rbId, userId: h.id, roles: ["HeadOfProjects"] };
    pm = { tenantId: rbId, userId: p.id, roles: ["ProjectManager"] };
    await withTenant(head, (tx) => tx.tenantIntegration.deleteMany({ where: { provider: "teams" } }));
    reportId = await withTenant(head, (tx) =>
      tx.portfolioReport
        .create({
          data: {
            tenantId: rbId,
            isoWeek: WEEK,
            status: "Approved",
            narrative: "Week 02: steady.\nNeeds attention: TMS-R is red.",
            payload: [
              { projectId: "x1", code: "TMS-G", name: "Teams Green", pmName: "Secret PM Name", rag: "Green", checkIn: "Confirmed", submittedToHead: true, narrative: "fine" },
              { projectId: "x2", code: "TMS-R", name: "Teams Red", pmName: "Secret PM Name", rag: "Red", checkIn: "Confirmed", submittedToHead: true, narrative: "late" },
            ],
            approvedById: head.userId,
            approvedAt: new Date("2025-01-10T10:00:00Z"),
          },
          select: { id: true },
        })
        .then((r) => r.id),
    );
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await withTenant(head, async (tx) => {
      await tx.tenantIntegration.deleteMany({ where: { provider: "teams" } });
      await tx.portfolioReport.deleteMany({ where: { id: reportId } });
      await tx.auditLog.deleteMany({ where: { actorId: { in: users } } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("connect: a PM can't; a failed test message isn't saved; a good one is saved encrypted", async () => {
    await expect(connectTeams(pm, { webhookUrl: WEBHOOK })).rejects.toBeInstanceOf(IntegrationError);
    stubTeams(500);
    await expect(connectTeams(head, { webhookUrl: WEBHOOK })).rejects.toMatchObject({ code: "TEST_FAILED" });
    expect(await teamsConnected(head)).toBe(false);
    vi.restoreAllMocks();

    const posts = stubTeams();
    const status = await connectTeams(head, { webhookUrl: WEBHOOK, channel: "PMO › Weekly" });
    expect(status).toMatchObject({ connected: true, host: "https://contoso.webhook.office.com", channel: "PMO › Weekly", lastError: null });
    expect(JSON.stringify(status)).not.toContain("IncomingWebhook");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.redirect).toBe("error");
    const row = await withTenant(head, (tx) => tx.tenantIntegration.findFirstOrThrow({ where: { provider: "teams" }, select: { secret: true, baseUrl: true } }));
    expect(row.secret).not.toContain("webhook.office.com");
    expect(row.baseUrl).toBe("https://contoso.webhook.office.com");
  });

  it("posts the approved week as the Head: summary and spread, no PM names; never as a PM", async () => {
    await expect(postRollupToTeams(pm, WEEK, "Riverbank")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const posts = stubTeams();
    expect(await postRollupToTeams(head, WEEK, "Riverbank")).toEqual({ posted: true, error: null });
    expect(posts[0]!.url).toBe(WEBHOOK);
    expect(posts[0]!.body).toContain("Needs attention: TMS-R is red.");
    expect(posts[0]!.body).toContain("2 projects · 1 on track · 0 at risk · 1 off track");
    expect(posts[0]!.body).not.toContain("Secret PM Name");
    expect(await postRollupToTeams(head, "2025-W03", "Riverbank")).toEqual({ posted: false, error: "That week's roll-up isn't approved yet." });
  });

  it("a Teams failure is recorded, not thrown", async () => {
    stubTeams(502);
    expect(await postRollupToTeams(head, WEEK, "Riverbank")).toEqual({ posted: false, error: "Teams answered 502." });
    expect((await getTeamsStatus(head)).lastError).toBe("Teams answered 502.");
  });

  it("another tenant sees no Teams connection", async () => {
    const other = { tenantId: dbId, userId: "seed", roles: ["HeadOfProjects"] };
    expect(await teamsConnected(other)).toBe(false);
    expect(await postRollupToTeams(other, WEEK, "Demo B")).toEqual({ posted: false, error: "Teams isn't connected." });
  });

  it("the PowerPoint deck needs reports:read", async () => {
    const member = { tenantId: rbId, userId: pm.userId, roles: ["TeamMember"] };
    await expect(buildDigestDeckExport(member, { template: "digest", week: WEEK, columns: [] })).rejects.toBeInstanceOf(ExportError);
    await expect(buildDigestDeckExport(head, { template: "build", week: WEEK, columns: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { deck, fileName } = await buildDigestDeckExport(head, { template: "digest", week: WEEK, columns: [] });
    expect(fileName).toBe(`qubit-rollup-${WEEK}.pptx`);
    expect(deck.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("disconnect removes it", async () => {
    expect((await disconnectTeams(head)).connected).toBe(false);
  });
});
