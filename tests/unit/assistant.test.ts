// @vitest-environment node
// Plan Phase 5 — the in-product assistant's pure parts: delegation tokens, the operations
// registry against the route files, the Lumi configuration files, the SSE reader, and the
// Lumi connector's token and retry rules (against a stubbed fetch — no network).
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELEGATION_AUDIENCE, signDelegation, verifyDelegation } from "@/server/assistant/delegation";
import { ASSISTANT_OPERATIONS, lumiRolesFor, toolName } from "@/server/assistant/operations";
import { buildLumiConfig, buildOpenApi, toYaml } from "@/server/assistant/lumi-config";
import { createSseParser } from "@/lib/sse";
import { clearLumiTokenCache, getAccessToken, LumiError, lumiFetch, startLumiSession, type LumiConnection } from "@/server/connectors/lumi";

const NOW = new Date("2026-11-26T09:00:00Z");
const t = Math.floor(NOW.getTime() / 1000);
const claims = { sub: "user-1", tid: "tenant-1", jti: "sess-1", aud: DELEGATION_AUDIENCE, iat: t, exp: t + 3600 };

describe("delegation tokens", () => {
  beforeEach(() => vi.stubEnv("ASSISTANT_TOKEN_SECRET", "unit-test-secret"));
  afterEach(() => vi.unstubAllEnvs());

  it("verifies a token QUBIT signed", () => {
    expect(verifyDelegation(signDelegation(claims), NOW)).toEqual(claims);
  });

  it("refuses a tampered, re-signed-elsewhere, wrong-audience, expired, too-long or alg-none token", () => {
    const good = signDelegation(claims);
    const [h, , s] = good.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: "someone-else" })).toString("base64url");
    expect(verifyDelegation(`${h}.${forged}.${s}`, NOW)).toBeNull();
    vi.stubEnv("ASSISTANT_TOKEN_SECRET", "another-secret");
    expect(verifyDelegation(good, NOW)).toBeNull();
    vi.stubEnv("ASSISTANT_TOKEN_SECRET", "unit-test-secret");
    expect(verifyDelegation(signDelegation({ ...claims, aud: "app" }), NOW)).toBeNull();
    expect(verifyDelegation(signDelegation({ ...claims, iat: t - 7200, exp: t - 3600 }), NOW)).toBeNull();
    expect(verifyDelegation(signDelegation({ ...claims, exp: t + 86_400 }), NOW)).toBeNull();
    const none = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.`;
    expect(verifyDelegation(none, NOW)).toBeNull();
    expect(verifyDelegation("not-a-token", NOW)).toBeNull();
  });

  it("derives a secret from AUTH_SECRET when ASSISTANT_TOKEN_SECRET is unset", () => {
    vi.stubEnv("ASSISTANT_TOKEN_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "auth-secret-for-tests");
    expect(verifyDelegation(signDelegation(claims), NOW)).toEqual(claims);
  });
});

describe("operations registry", () => {
  const root = path.resolve(__dirname, "../../src/app/api/assistant/v1");
  const fileFor = (p: string) => path.join(root, p.replace(/\{(\w+)\}/g, "[$1]"), "route.ts");

  it("has a route file exporting each operation's method", () => {
    for (const op of ASSISTANT_OPERATIONS) {
      const f = fileFor(op.path);
      expect(fs.existsSync(f), `${op.operationId}: ${f}`).toBe(true);
      expect(fs.readFileSync(f, "utf8"), op.operationId).toMatch(new RegExp(`export const ${op.method} =`));
    }
  });

  it("has unique ids, Lumi's tool names, and a summary on every operation", () => {
    const ids = ASSISTANT_OPERATIONS.map((o) => o.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(toolName({ operationId: "saveCheckInDraft" })).toBe("save_check_in_draft");
    for (const op of ASSISTANT_OPERATIONS) expect(op.summary.length).toBeGreaterThan(20);
  });

  it("maps QUBIT roles to Lumi roles, defaulting to member", () => {
    expect(lumiRolesFor(["ProjectManager", "Executive"])).toEqual(["executive", "pm"]);
    expect(lumiRolesFor(["PlatformSuperAdmin"])).toEqual(["head"]);
    expect(lumiRolesFor([])).toEqual(["member"]);
  });
});

describe("Lumi configuration files", () => {
  it("describes every operation in OpenAPI with a dry run on writes", () => {
    const spec = buildOpenApi() as { paths: Record<string, Record<string, { operationId: string; parameters?: { name: string }[] }>> };
    const ops = Object.values(spec.paths).flatMap((p) => Object.values(p));
    expect(ops.map((o) => o.operationId).sort()).toEqual(ASSISTANT_OPERATIONS.map((o) => o.operationId).sort());
    const draft = spec.paths["/projects/{id}/checkin-draft"]!.post!;
    expect(draft.parameters?.map((p) => p.name)).toContain("dryRun");
  });

  it("lists tools by role, never giving members PM-only writes, and declares pii_fields and retention", () => {
    const cfg = buildLumiConfig() as { roles: Record<string, string[]>; tools: { name: string; writes?: boolean }[]; pii_fields: string[]; retention: unknown; auth: unknown };
    expect(cfg.roles.member).not.toContain("save_check_in_draft");
    expect(cfg.roles.pm).toContain("save_check_in_draft");
    expect(cfg.roles.head).toEqual(cfg.tools.map((x) => x.name));
    expect(cfg.pii_fields).toEqual(expect.arrayContaining(["personName", "pmName"]));
    expect(cfg.pii_fields).not.toContain("name");
    expect(cfg.retention).toEqual({ conversations_days: 30, files_days: 7 });
    expect(cfg.auth).toEqual({ mode: "pass_through" });
    for (const tool of cfg.tools.filter((x) => x.writes)) expect(tool).toMatchObject({ dry_run: { query: "dryRun" } });
  });

  it("writes YAML that parses back to the same document", async () => {
    const yaml = toYaml(buildLumiConfig());
    // js-yaml is only a transitive dependency here: load it by name, untyped, and skip if absent.
    const name = "js-yaml";
    const mod = (await import(/* @vite-ignore */ name).catch(() => null)) as { load?: (s: string) => unknown; default?: { load: (s: string) => unknown } } | null;
    const load = mod?.load ?? mod?.default?.load;
    if (!load) return; // the structure is still checked above
    expect(load(yaml)).toEqual(buildLumiConfig());
  });
});

describe("SSE reader", () => {
  it("parses events across arbitrary chunking and ignores keep-alives", () => {
    const got: { event: string; data: unknown }[] = [];
    const p = createSseParser((e) => got.push({ event: e.event, data: e.data }));
    const text = ': keep-alive\n\nid: 1\nevent: run.started\ndata: {"run_id":"run_1"}\n\nid: 2\nevent: text.delta\ndata: {"text":"Hi "}\n\nevent: text.delta\ndata: {"text":"there"}\n\n';
    for (let i = 0; i < text.length; i += 7) p.push(text.slice(i, i + 7));
    p.end();
    expect(got).toEqual([
      { event: "run.started", data: { run_id: "run_1" } },
      { event: "text.delta", data: { text: "Hi " } },
      { event: "text.delta", data: { text: "there" } },
    ]);
  });
});

describe("Lumi connector", () => {
  const conn: LumiConnection = { baseUrl: "https://lumi.invalid/v1", clientId: "cred_test", clientSecret: "s3cret-value", source: "env" };
  const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearLumiTokenCache();
    fetchMock = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => vi.restoreAllMocks());

  it("exchanges the credential as a form and reuses the token", async () => {
    fetchMock.mockResolvedValue(reply(200, { access_token: "at_1", token_type: "Bearer", expires_in: 900 }));
    expect(await getAccessToken(conn)).toBe("at_1");
    expect(await getAccessToken(conn)).toBe("at_1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://lumi.invalid/v1/oauth/token");
    expect(String((init as RequestInit).body)).toContain("grant_type=client_credentials");
  });

  it("fetches a new token once on a 401, and retries a rate limit once", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { access_token: "at_old", expires_in: 900 }))
      .mockResolvedValueOnce(reply(401, { error: "unauthenticated", message: "expired" }))
      .mockResolvedValueOnce(reply(200, { access_token: "at_new", expires_in: 900 }))
      .mockResolvedValueOnce(reply(429, { error: "rate_limited", message: "slow down" }, { "retry-after": "0" }))
      .mockResolvedValueOnce(reply(200, { ok: true }));
    const res = await lumiFetch(conn, "/me");
    expect(res.status).toBe(200);
    const auths = (fetchMock.mock.calls as unknown[][]).filter(([u]) => String(u).endsWith("/me")).map(([, i]) => (i as RequestInit).headers as Record<string, string>);
    expect(auths.map((h) => h.authorization)).toEqual(["Bearer at_old", "Bearer at_new", "Bearer at_new"]);
  });

  it("doesn't retry other errors, and reads Lumi's flat error shape", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { access_token: "at", expires_in: 900 })).mockResolvedValueOnce(reply(409, { error: "autopilot_off", message: "Autopilot is off." }));
    await expect(startLumiSession(conn, { user: { id: "u" }, delegation: { user_token: "t", expires_at: NOW.toISOString() } })).rejects.toMatchObject({ status: 409, code: "autopilot_off" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new LumiError("x", 400, "validation_failed")).toBeInstanceOf(Error);
  });
});
