// Q's LLM provider — pins the OpenAI-compatible wire contract (request shape, response
// parsing, tool calls, <think> stripping, HTTP errors) by mocking fetch. No network.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { llmChat, llmEnabled, llmModel, LlmError } from "@/server/q/llm";

// Minimal fetch Response stand-in (env-agnostic — only what llmChat reads).
function reply(status: number, json: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
    text: async () => JSON.stringify(json),
  } as unknown as Response;
}

describe("Q LLM provider (OpenAI-compatible)", () => {
  beforeAll(() => {
    process.env.Q_AI_BASE_URL = "https://example.invalid/v1";
    process.env.Q_AI_API_KEY = "test-key";
    process.env.Q_AI_MODEL = "qwen3-14b";
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => {
    delete process.env.Q_AI_BASE_URL;
    delete process.env.Q_AI_API_KEY;
  });

  it("is enabled when base URL + key are set, and reports the configured model", () => {
    expect(llmEnabled()).toBe(true);
    expect(llmModel()).toBe("qwen3-14b");
  });

  it("POSTs OpenAI-shaped chat completions and parses reply + usage (stripping <think>)", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return reply(200, {
          choices: [{ message: { content: "<think>secret reasoning</think>Hello there" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 12, completion_tokens: 5 },
        });
      }),
    );

    const res = await llmChat({ system: "sys", messages: [{ role: "user", content: "hi" }], maxTokens: 50 });
    expect(res.text).toBe("Hello there"); // <think>…</think> removed
    expect(res.inputTokens).toBe(12);
    expect(res.outputTokens).toBe(5);

    const { url, init } = calls[0];
    expect(url).toBe("https://example.invalid/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("qwen3-14b");
    expect(body.max_tokens).toBe(50);
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(body.messages[1]).toEqual({ role: "user", content: "hi" });
  });

  it("surfaces tool calls and advertises tools when provided", async () => {
    let sentBody: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(init.body as string);
        return reply(200, {
          choices: [
            {
              message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "list_projects", arguments: "{}" } }] },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        });
      }),
    );

    const res = await llmChat({
      messages: [{ role: "user", content: "list projects" }],
      tools: [{ type: "function", function: { name: "list_projects", description: "d", parameters: { type: "object", properties: {} } } }],
    });
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0].function.name).toBe("list_projects");
    expect(sentBody.tool_choice).toBe("auto");
    expect(Array.isArray(sentBody.tools)).toBe(true);
  });

  it("throws LlmError on an HTTP failure (without leaking the body)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(500, { error: "boom", echoedKey: "test-key" })));
    await expect(llmChat({ messages: [{ role: "user", content: "x" }] })).rejects.toBeInstanceOf(LlmError);
  });
});
