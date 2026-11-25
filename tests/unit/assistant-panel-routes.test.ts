// @vitest-environment node
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// Plan Phase 5 — the Ask Q panel's Lumi routes: Lumi's event stream is passed through, an
// expired Lumi session is replaced once, and "assistant off" answers 409 ASSISTANT_OFF so the
// drawer falls back to the local Ask Q. Lumi and the session store are mocked.
vi.mock("@/lib/tenant", async (orig) => ({ ...(await orig<typeof import("@/lib/tenant")>()), getTenantContext: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { name: "Fixture PM" } })) }));
vi.mock("@/server/assistant/sessions", async (orig) => {
  const actual = await orig<typeof import("@/server/assistant/sessions")>();
  return { ...actual, openAssistantSession: vi.fn() };
});
vi.mock("@/server/connectors/lumi", async (orig) => {
  const actual = await orig<typeof import("@/server/connectors/lumi")>();
  return { ...actual, startRunStream: vi.fn() };
});

import { getTenantContext } from "@/lib/tenant";
import { AssistantUnavailableError, openAssistantSession } from "@/server/assistant/sessions";
import { LumiError, startRunStream } from "@/server/connectors/lumi";
import { POST as run } from "@/app/api/assistant/runs/route";

const ctx = { tenantId: "t1", userId: "u1", roles: ["ProjectManager"], permissions: ["project:read"] };
const session = (token: string) => ({ conn: { baseUrl: "https://lumi.invalid/v1", clientId: "cred_x", clientSecret: "x", source: "env" as const }, sessionId: "s1", sessionToken: token, expiresAt: new Date(Date.now() + 3_600_000) });
const ask = (body: unknown) => run(new Request("http://localhost/api/assistant/runs", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  (getTenantContext as unknown as Mock).mockResolvedValue(ctx);
});

describe("POST /api/assistant/runs", () => {
  it("streams Lumi's events through", async () => {
    (openAssistantSession as unknown as Mock).mockResolvedValue(session("st_1"));
    (startRunStream as unknown as Mock).mockResolvedValue(new Response('event: text.delta\ndata: {"text":"Hi"}\n\n', { headers: { "content-type": "text/event-stream" } }));
    const res = await ask({ message: "Which projects are red?" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(await res.text()).toContain('"text":"Hi"');
    expect((startRunStream as unknown as Mock).mock.calls[0]![1]).toBe("st_1");
  });

  it("replaces an expired Lumi session once and retries", async () => {
    (openAssistantSession as unknown as Mock).mockResolvedValueOnce(session("st_old")).mockResolvedValueOnce(session("st_new"));
    (startRunStream as unknown as Mock).mockRejectedValueOnce(new LumiError("expired", 401, "session_expired")).mockResolvedValueOnce(new Response("event: run.completed\ndata: {}\n\n"));
    expect((await ask({ message: "Hello" })).status).toBe(200);
    expect((openAssistantSession as unknown as Mock).mock.calls[1]![1]).toEqual({ fresh: true });
    expect((startRunStream as unknown as Mock).mock.calls[1]![1]).toBe("st_new");
  });

  it("answers 409 ASSISTANT_OFF when Lumi's autopilot is off", async () => {
    (openAssistantSession as unknown as Mock).mockRejectedValue(new AssistantUnavailableError("off", "autopilot_off"));
    const res = await ask({ message: "Hello" });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ASSISTANT_OFF");
  });

  it("refuses an empty message and a malformed conversation id", async () => {
    expect((await ask({ message: "  " })).status).toBe(400);
    expect((await ask({ message: "Hi", conversationId: "../../x" })).status).toBe(400);
  });
});
