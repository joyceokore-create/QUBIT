// Agentic Q — graceful fallback when the AI provider is unconfigured (the live tool loop
// needs the Q AI box + network). setup.ts strips Q_AI_* so this is the true offline path.
import { describe, expect, it, beforeAll } from "vitest";
import { runQChat } from "@/server/q/agent";

describe("Agentic Q — fallback", () => {
  beforeAll(() => {
    delete process.env.Q_MOCK_AI; // test the true no-provider, no-mock fallback
  });

  it("returns a helpful non-AI reply when the provider is unconfigured", async () => {
    const ctx = { tenantId: "t", userId: "u", roles: [] };
    const res = await runQChat(ctx, { messages: [{ role: "user", content: "How is the portfolio?" }], tenantName: "Acme" });
    expect(res.usedAi).toBe(false);
    expect(res.toolsUsed).toEqual([]);
    expect(res.reply.toLowerCase()).toMatch(/q ai service|report shortcuts/);
  });
});
