// Plan Phase 5 — QUBIT's side of the in-product assistant. Lumi calls /api/assistant/v1/*
// with a person's delegation token: it works only while that session is live, only as that
// person with permissions read fresh from the database, never across tenants; writes need
// the same rights as in the app, a dry run writes nothing, and real writes are audited as
// via "lumi". Sessions: Lumi is stubbed (no network) — tokens are sealed, roles mapped,
// "autopilot off" falls back, and ending revokes everything.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getCurrentCheckIn } from "@/server/checkins";
import { mintDelegation, revokeAssistantSessions, verifyDelegation } from "@/server/assistant/delegation";
import { AssistantUnavailableError, endAssistantForUser, openAssistantSession } from "@/server/assistant/sessions";
import { clearLumiTokenCache } from "@/server/connectors/lumi";
import { GET as listProjects } from "@/app/api/assistant/v1/projects/route";
import { GET as getProject } from "@/app/api/assistant/v1/projects/[id]/route";
import { POST as saveDraft } from "@/app/api/assistant/v1/projects/[id]/checkin-draft/route";
import { GET as weeklyRollup } from "@/app/api/assistant/v1/reports/week/route";
import { POST as raiseBlocker } from "@/app/api/assistant/v1/projects/[id]/blockers/route";
import { createUsers, cleanupFixtureUsers } from "./_users";

const BASE = "http://localhost/api/assistant/v1";
const call = (handler: (req: Request, ctx: { params: Promise<unknown> }) => Promise<Response>, path: string, token: string | null, init: RequestInit & { params?: Record<string, string> } = {}) =>
  handler(new Request(`${BASE}${path}`, { ...init, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } }), { params: Promise.resolve(init.params ?? {}) });

describe("assistant API (delegation tokens)", () => {
  let rbId: string;
  let dbId: string;
  let pm: TenantContext;
  let member: TenantContext;
  let mine: string;
  let notMine: string;
  let foreign: string;
  const users: string[] = [];

  beforeAll(async () => {
    const [rb, db] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [p, m] = await createUsers(rbId, 2, "ast");
    users.push(p.id, m.id);
    pm = { tenantId: rbId, userId: p.id, roles: ["ProjectManager"] };
    member = { tenantId: rbId, userId: m.id, roles: ["Member"] };
    await withTenant(pm, async (tx) => {
      await tx.roleAssignment.createMany({ data: [{ tenantId: rbId, userId: p.id, role: "ProjectManager" }, { tenantId: rbId, userId: m.id, role: "Member" }] });
      mine = (await tx.project.create({ data: { tenantId: rbId, code: "AST-A", name: "Assistant Alpha", type: "Project", priority: "Med", status: "OnTrack", leadUserId: p.id }, select: { id: true } })).id;
      notMine = (await tx.project.create({ data: { tenantId: rbId, code: "AST-B", name: "Assistant Bravo", type: "Project", priority: "Med", status: "OnTrack", leadUserId: null }, select: { id: true } })).id;
      await tx.projectMember.create({ data: { tenantId: rbId, projectId: mine, userId: m.id, role: "Developer" } });
    });
    foreign = await withTenant({ tenantId: dbId, userId: "seed" }, (tx) => tx.project.create({ data: { tenantId: dbId, code: "AST-X", name: "Assistant Foreign", type: "Project", priority: "Med", status: "OnTrack" }, select: { id: true } })).then((x) => x.id);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await withTenant(pm, async (tx) => {
      await tx.blocker.deleteMany({ where: { projectId: { in: [mine, notMine] } } });
      await tx.checkIn.deleteMany({ where: { projectId: { in: [mine, notMine] } } });
      await tx.domainEvent.deleteMany({ where: { entityId: { in: [mine, notMine] } } });
      await tx.projectMember.deleteMany({ where: { projectId: { in: [mine, notMine] } } });
      await tx.project.deleteMany({ where: { id: { in: [mine, notMine] } } });
    });
    await withTenant({ tenantId: dbId, userId: "seed" }, (tx) => tx.project.deleteMany({ where: { id: foreign } }));
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("refuses a call without a token, with a bad one, or with only a cookie", async () => {
    expect((await call(listProjects, "/projects", null)).status).toBe(401);
    expect((await call(listProjects, "/projects", "a.b.c")).status).toBe(401);
    expect((await call(listProjects, "/projects", null, { headers: { cookie: "authjs.session-token=whatever" } })).status).toBe(401);
  });

  it("reads as the person, inside their tenant only", async () => {
    const { token } = await mintDelegation(pm);
    const res = await call(listProjects, "/projects", token);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const codes = ((await res.json()) as { items: { code: string }[] }).items.map((p) => p.code);
    expect(codes).toEqual(expect.arrayContaining(["AST-A", "AST-B"]));
    expect(codes).not.toContain("AST-X");
    expect((await call(getProject, `/projects/${foreign}`, token, { params: { id: foreign } })).status).toBe(404);
    const one = (await (await call(getProject, `/projects/${mine}`, token, { params: { id: mine } })).json()) as { code: string; checkIn: { status: string } };
    expect(one).toMatchObject({ code: "AST-A", checkIn: { status: "Draft" } });
  });

  it("stops working the moment the session is revoked, or the person is deactivated", async () => {
    const a = await mintDelegation(pm);
    await revokeAssistantSessions(pm, a.sessionId);
    expect((await call(listProjects, "/projects", a.token)).status).toBe(401);

    const b = await mintDelegation(member);
    await withTenant(member, (tx) => tx.user.update({ where: { id: member.userId }, data: { status: "DISABLED" } }));
    try {
      expect((await call(listProjects, "/projects", b.token)).status).toBe(401);
    } finally {
      await withTenant(member, (tx) => tx.user.update({ where: { id: member.userId }, data: { status: "ACTIVE" } }));
    }
  });

  it("reads permissions fresh on every call: a removed role is removed now", async () => {
    const { token } = await mintDelegation(pm);
    expect((await call(weeklyRollup, "/reports/week", token)).status).toBe(200);
    await withTenant(pm, (tx) => tx.roleAssignment.deleteMany({ where: { userId: pm.userId } }));
    try {
      expect((await call(weeklyRollup, "/reports/week", token)).status).toBe(403);
    } finally {
      await withTenant(pm, (tx) => tx.roleAssignment.create({ data: { tenantId: rbId, userId: pm.userId, role: "ProjectManager" } }));
    }
  });

  it("drafts a check-in only on a project the person runs; a dry run writes nothing; the write is audited via lumi", async () => {
    const { token } = await mintDelegation(pm);
    const body = JSON.stringify({ narrative: "UAT slipped a week; vendor fix due Friday.", ragOverride: "Amber", overrideReason: "Vendor slip pushes UAT out." });
    const dry = await call(saveDraft, `/projects/${mine}/checkin-draft?dryRun=1`, token, { method: "POST", body, params: { id: mine } });
    expect(dry.status).toBe(200);
    expect(await dry.json()).toMatchObject({ dryRun: true, wouldSave: { narrative: "UAT slipped a week; vendor fix due Friday." } });
    expect((await getCurrentCheckIn(pm, mine)).narrative ?? "").not.toMatch(/UAT slipped/);

    expect((await call(saveDraft, `/projects/${notMine}/checkin-draft`, token, { method: "POST", body, params: { id: notMine } })).status).toBe(403);

    const real = await call(saveDraft, `/projects/${mine}/checkin-draft`, token, { method: "POST", body, params: { id: mine } });
    expect(real.status).toBe(200);
    expect((await getCurrentCheckIn(pm, mine)).narrative).toBe("UAT slipped a week; vendor fix due Friday.");
    const row = await withTenant(pm, (tx) => tx.auditLog.findFirst({ where: { actorId: pm.userId, entityType: "check_in" }, orderBy: { createdAt: "desc" }, select: { via: true } }));
    expect(row?.via).toBe("lumi");
  });

  it("lets a member raise a blocker on their project but not draft a check-in", async () => {
    const { token } = await mintDelegation(member);
    const ok = await call(raiseBlocker, `/projects/${mine}/blockers`, token, { method: "POST", body: JSON.stringify({ description: "Waiting on test data from the bank.", severity: "Medium" }), params: { id: mine } });
    expect(ok.status).toBe(200);
    expect((await call(raiseBlocker, `/projects/${notMine}/blockers`, token, { method: "POST", body: JSON.stringify({ description: "Not my project." }), params: { id: notMine } })).status).toBe(403);
    expect((await call(saveDraft, `/projects/${mine}/checkin-draft`, token, { method: "POST", body: JSON.stringify({ narrative: "A member's line." }), params: { id: mine } })).status).toBe(403);
    expect((await call(raiseBlocker, `/projects/${mine}/blockers`, token, { method: "POST", body: JSON.stringify({}), params: { id: mine } })).status).toBe(400);
  });

  describe("sessions with Lumi (stubbed)", () => {
    const lumi = (handler: (url: string, init: RequestInit) => Response) => {
      vi.stubEnv("LUMI_BASE_URL", "https://lumi.invalid/v1");
      vi.stubEnv("LUMI_CLIENT_ID", "cred_test");
      vi.stubEnv("LUMI_CLIENT_SECRET", "not-a-real-secret");
      clearLumiTokenCache();
      return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith("/oauth/token")) return Response.json({ access_token: "at_test", expires_in: 900 });
        return handler(url, init ?? {});
      });
    };

    it("starts a Lumi session with a valid delegation token and the person's Lumi roles, stores its token sealed, and reuses it", async () => {
      let sent: { user: { id: string; roles: string[] }; delegation: { user_token: string } } | null = null;
      const fetch = lumi((url, init) => {
        if (url.endsWith("/sessions")) {
          sent = JSON.parse(String(init.body));
          return Response.json({ session_id: "ses_1", session_token: "lumi_st_secret", expires_at: new Date(Date.now() + 3_600_000).toISOString() }, { status: 201 });
        }
        return Response.json({});
      });
      const s = await openAssistantSession({ ...pm, name: "Fixture PM" });
      expect(s.sessionToken).toBe("lumi_st_secret");
      expect(sent!.user).toMatchObject({ id: pm.userId, roles: ["pm"] });
      expect(verifyDelegation(sent!.delegation.user_token)).toMatchObject({ sub: pm.userId, tid: rbId, jti: s.sessionId });
      const stored = await withTenant(pm, (tx) => tx.assistantSession.findUniqueOrThrow({ where: { id: s.sessionId }, select: { lumiSessionId: true, lumiSessionToken: true } }));
      expect(stored.lumiSessionId).toBe("ses_1");
      expect(stored.lumiSessionToken).not.toContain("lumi_st_secret");
      const again = await openAssistantSession(pm);
      expect(again.sessionId).toBe(s.sessionId);
      expect(fetch.mock.calls.filter(([u]) => String(u).endsWith("/sessions"))).toHaveLength(1);

      // Ending: Lumi's session is ended and every delegation token stops working.
      const ended: string[] = [];
      vi.restoreAllMocks();
      lumi((url, init) => {
        if (init.method === "DELETE") ended.push(url);
        return new Response(null, { status: 204 });
      });
      await endAssistantForUser(pm);
      expect(ended.some((u) => u.endsWith("/sessions/ses_1"))).toBe(true);
      expect((await call(listProjects, "/projects", sent!.delegation.user_token)).status).toBe(401);
    });

    it("falls back when Lumi's autopilot is off, and revokes the unused delegation", async () => {
      lumi((url) => (url.endsWith("/sessions") ? Response.json({ error: "autopilot_off", message: "Autopilot is off." }, { status: 409 }) : Response.json({})));
      const rows = () => withTenant(member, (tx) => tx.assistantSession.findMany({ where: { userId: member.userId }, select: { id: true, revokedAt: true } }));
      const before = new Set((await rows()).map((r) => r.id));
      await expect(openAssistantSession(member, { fresh: true })).rejects.toBeInstanceOf(AssistantUnavailableError);
      const made = (await rows()).filter((r) => !before.has(r.id));
      expect(made).toHaveLength(1);
      expect(made[0]!.revokedAt).not.toBeNull();
    });
  });
});
