// Plan Phase 4 — drafting the Head's managerial summary. Head-only; grounded in the week's
// roll-up; the AI draft is used only when it passes the checks, otherwise the rules write it
// (AI off, daily cap used, call failed, or an invented project code). Metrics-only logging.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { confirmCheckIn } from "@/server/checkins";
import { clearLumiTokenCache } from "@/server/connectors/lumi";
import { generateRollupSummary, SUMMARY_PURPOSE } from "@/server/rollup-summary";
import { createUsers, cleanupFixtureUsers } from "./_users";

const NOW = new Date("2026-10-07T10:00:00Z");

/** The internal AI box, answered by a stub instead of the network. */
function stubAi(reply: string | Error) {
  vi.stubEnv("Q_AI_BASE_URL", "http://ai.invalid/v1");
  vi.stubEnv("Q_AI_API_KEY", "test-key");
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify({ choices: [{ message: { content: reply }, finish_reason: "stop" }], usage: { prompt_tokens: 120, completion_tokens: 40 } }), { status: 200, headers: { "content-type": "application/json" } });
  });
}

/**
 * Lumi (connected via env) and optionally the internal box, both stubbed. `lumi` is Lumi's
 * draft, or an Error for a failed run. Records what Lumi was sent and what it deleted.
 */
function stubLumiAndAi(lumi: string | Error, box?: string) {
  vi.stubEnv("LUMI_BASE_URL", "https://lumi.example.invalid/api/v1");
  vi.stubEnv("LUMI_CLIENT_ID", "cred_test");
  vi.stubEnv("LUMI_CLIENT_SECRET", "not-a-real-secret");
  if (box !== undefined) {
    vi.stubEnv("Q_AI_BASE_URL", "http://ai.invalid/v1");
    vi.stubEnv("Q_AI_API_KEY", "test-key");
  }
  const seen = { lumiMessages: [] as string[], lumiData: [] as string[], deleted: [] as string[], boxCalls: 0 };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith("http://ai.invalid")) {
      seen.boxCalls++;
      return json({ choices: [{ message: { content: box }, finish_reason: "stop" }], usage: { prompt_tokens: 120, completion_tokens: 40 } });
    }
    if (url.endsWith("/oauth/token")) return json({ access_token: "tok", expires_in: 900 });
    if (url.endsWith("/files")) {
      seen.lumiData.push(await ((init?.body as FormData).get("file") as Blob).text());
      return json({ file_id: "file_s", status: "ready" }, 201);
    }
    if (url.endsWith("/runs")) {
      seen.lumiMessages.push((JSON.parse(String(init?.body)) as { message: string }).message);
      if (lumi instanceof Error) return json({ error: "internal", message: lumi.message }, 500);
      return json({ run_id: "run_s", conversation_id: "conv_s", status: "done", model: "lumi-model", output: { text: lumi, data: null }, usage: { input_tokens: 300, output_tokens: 60 } });
    }
    if (init?.method === "DELETE") {
      seen.deleted.push(url.replace(/^.*\/api\/v1/, ""));
      return new Response(null, { status: 204 });
    }
    return json({ error: "not_found" }, 404);
  });
  return seen;
}

describe("rollup summary", () => {
  let rbId: string;
  let head: TenantContext;
  let pm: TenantContext;
  let red: string;

  beforeAll(async () => {
    const rb = await prisma.tenant.findUnique({ where: { slug: "riverbank" } });
    if (!rb) throw new Error("Seed required.");
    rbId = rb.id;
    const [h, p] = await createUsers(rbId, 2, "sum");
    head = { tenantId: rbId, userId: h.id, roles: ["HeadOfProjects"] };
    pm = { tenantId: rbId, userId: p.id, roles: ["ProjectManager"] };
    red = await withTenant(pm, (tx) => tx.project.create({ data: { tenantId: rbId, code: "SUM-R", name: "Summary Red", type: "Project", priority: "High", status: "OnTrack", leadUserId: pm.userId }, select: { id: true } })).then((x) => x.id);
    await confirmCheckIn(pm, red, { narrative: "Vendor missed the SIT drop; new date is next Tuesday.", ragOverride: "Red", overrideReason: "Vendor slip blocks SIT this week." }, NOW);
  });

  // The local .env may hold a real Lumi key: no test reaches Lumi unless it stubs it.
  beforeEach(() => {
    for (const k of ["LUMI_BASE_URL", "LUMI_CLIENT_ID", "LUMI_CLIENT_SECRET", "Q_AI_BASE_URL", "Q_AI_API_KEY"]) vi.stubEnv(k, "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    clearLumiTokenCache();
  });

  afterAll(async () => {
    await withTenant(head, async (tx) => {
      await tx.aiCallLog.deleteMany({ where: { userId: { in: [head.userId, pm.userId] } } });
      await tx.notification.deleteMany({ where: { userId: { in: [head.userId, pm.userId] } } });
      await tx.domainEvent.deleteMany({ where: { entityId: red } });
      await tx.checkIn.deleteMany({ where: { projectId: red } });
      await tx.auditLog.deleteMany({ where: { actorId: { in: [head.userId, pm.userId] } } });
      await tx.project.deleteMany({ where: { id: red } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  const logs = () => withTenant(head, (tx) => tx.aiCallLog.findMany({ where: { userId: head.userId, purpose: SUMMARY_PURPOSE }, select: { usedAi: true, inputTokens: true }, orderBy: { createdAt: "asc" } }));

  it("is the Head's: a PM is refused, a future week is refused", async () => {
    await expect(generateRollupSummary(pm, { tenantName: "Riverbank" }, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(generateRollupSummary(head, { week: "2026-W52", tenantName: "Riverbank" }, NOW)).rejects.toMatchObject({ code: "BAD_WEEK" });
  });

  it("writes the summary by rules when no AI is configured, grounded in the week's roll-up", async () => {
    const out = await generateRollupSummary(head, { tenantName: "Riverbank" }, NOW);
    expect(out).toMatchObject({ engine: "rules", reason: "off" });
    expect(out.text).toMatch(/^Week 41: /);
    expect(out.text).toMatch(/Needs attention: .*SUM-R Summary Red \(red, was green\): Vendor missed the SIT drop/);
    expect(out.text.length).toBeLessThanOrEqual(1000);
    expect((await logs()).at(-1)).toEqual({ usedAi: false, inputTokens: 0 });
  });

  it("uses the AI's draft when it passes the checks, sending no PM names", async () => {
    const fetch = stubAi("**Week 41:** mostly steady.\nNeeds attention: SUM-R Summary Red is red after a vendor slip.");
    const out = await generateRollupSummary(head, { tenantName: "Riverbank" }, NOW);
    expect(out).toEqual({ engine: "ai", via: "local", text: "Week 41: mostly steady.\nNeeds attention: SUM-R Summary Red is red after a vendor slip." });
    const body = JSON.parse(String(fetch.mock.calls[0]![1]!.body)) as { messages: { content: string }[] };
    expect(body.messages.at(-1)!.content).toContain("SUM-R");
    expect(body.messages.at(-1)!.content).not.toContain("pmName");
    expect((await logs()).at(-1)).toEqual({ usedAi: true, inputTokens: 120 });
  });

  it("falls back to the rules when the AI invents a project, fails, or today's cap is used", async () => {
    stubAi("Week 41: fine. Needs attention: ZZZ-9 Phantom project is red.");
    expect(await generateRollupSummary(head, { tenantName: "Riverbank" }, NOW)).toMatchObject({ engine: "rules", reason: "rejected" });
    vi.restoreAllMocks();

    stubAi(new Error("socket hang up"));
    expect(await generateRollupSummary(head, { tenantName: "Riverbank" }, NOW)).toMatchObject({ engine: "rules", reason: "failed" });
    vi.restoreAllMocks();

    const fetch = stubAi("Week 41: fine.");
    vi.stubEnv("Q_AI_DAILY_CAP", "0");
    expect(await generateRollupSummary(head, { tenantName: "Riverbank" }, NOW)).toMatchObject({ engine: "rules", reason: "cap" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Lumi drafts first when connected: grounded, no PM names, conversation deleted", async () => {
    const seen = stubLumiAndAi("Week 41: one red.\nNeeds attention: SUM-R Summary Red slipped on the vendor's SIT drop.", "Week 41: from the box.");
    const out = await generateRollupSummary(head, { tenantName: "Riverbank" }, NOW);
    expect(out).toEqual({ engine: "ai", via: "lumi", text: "Week 41: one red.\nNeeds attention: SUM-R Summary Red slipped on the vendor's SIT drop." });
    // The instructions go in the message, the week's data as an attached JSON file — no PM names.
    expect(seen.lumiMessages[0]).toContain("Use ONLY the JSON data");
    expect(seen.lumiMessages[0]).toContain("attached week.json");
    expect(seen.lumiData[0]).toContain("SUM-R");
    expect(seen.lumiData[0]).not.toContain("pmName");
    expect(seen.deleted).toEqual(["/conversations/conv_s"]);
    expect(seen.boxCalls).toBe(0);
    const last = await withTenant(head, (tx) => tx.aiCallLog.findFirst({ where: { userId: head.userId, purpose: SUMMARY_PURPOSE }, orderBy: { createdAt: "desc" }, select: { model: true, usedAi: true, inputTokens: true } }));
    expect(last).toEqual({ model: "lumi-model", usedAi: true, inputTokens: 300 });
  });

  it("a Lumi draft that fails the checks, or a failed Lumi run, passes to the in-house box, then the rules", async () => {
    let seen = stubLumiAndAi("Week 41: Needs attention: ZZZ-9 Phantom is red.", "Week 41: steady.\nNeeds attention: SUM-R Summary Red is red.");
    expect(await generateRollupSummary(head, { tenantName: "Riverbank" }, NOW)).toMatchObject({ engine: "ai", via: "local" });
    expect(seen.boxCalls).toBe(1);
    vi.restoreAllMocks();
    vi.stubEnv("Q_AI_BASE_URL", "");
    clearLumiTokenCache();

    seen = stubLumiAndAi(new Error("boom"));
    expect(await generateRollupSummary(head, { tenantName: "Riverbank" }, NOW)).toMatchObject({ engine: "rules", reason: "failed" });
    vi.restoreAllMocks();
    clearLumiTokenCache();

    seen = stubLumiAndAi("Week 41: ZZZ-9 Phantom is red.");
    expect(await generateRollupSummary(head, { tenantName: "Riverbank" }, NOW)).toMatchObject({ engine: "rules", reason: "rejected" });
    expect(seen.boxCalls).toBe(0);
  });
});
