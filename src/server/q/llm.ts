/**
 * Q's LLM provider — an OpenAI-compatible Chat Completions endpoint (Riverbank's internal
 * "rbsai" agentic box, model qwen3-14b by default). Server-only; the key never reaches the
 * client. Configured entirely via env so nothing is hardcoded:
 *
 *   Q_AI_BASE_URL   e.g. https://rbsai.rbrc.io/v1   (the "/v1" root; we POST /chat/completions)
 *   Q_AI_API_KEY    bearer token (git-ignored .env only — never committed)
 *   Q_AI_MODEL      e.g. qwen3-14b                  (optional; defaults to qwen3-14b)
 *
 * This is deliberately NOT the Anthropic SDK: the box speaks the OpenAI wire format
 * (`messages`/`choices[].message`/`usage.prompt_tokens`). Because it's an internal box,
 * tenant data stays in-house. When it's unconfigured, callers fall back to their
 * deterministic (or mock) path, so every feature still works offline.
 */

const DEFAULT_MODEL = "qwen3-14b";
const DEFAULT_TIMEOUT_MS = 90_000;

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
}

export interface LlmToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface LlmTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface LlmResult {
  text: string;
  toolCalls: LlmToolCall[];
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
}

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

/** True when the internal AI box is configured (base URL + key present). */
export function llmEnabled(): boolean {
  return Boolean(process.env.Q_AI_BASE_URL && process.env.Q_AI_API_KEY);
}

/** The configured model id (logged to AiCallLog; never a hardcoded default surprise). */
export function llmModel(): string {
  return process.env.Q_AI_MODEL || DEFAULT_MODEL;
}

// Reasoning models (Qwen etc.) may wrap chain-of-thought in <think>…</think>. Strip it so
// only the answer surfaces to users and downstream JSON parsers.
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

interface ChatOptions {
  system?: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

/**
 * One round-trip to the OpenAI-compatible endpoint. Prepends `system` as a system message,
 * returns normalised text + any tool calls + token usage. Throws LlmError on transport/HTTP
 * failure so callers can degrade gracefully.
 */
export async function llmChat(opts: ChatOptions): Promise<LlmResult> {
  const base = (process.env.Q_AI_BASE_URL || "").replace(/\/+$/, "");
  const key = process.env.Q_AI_API_KEY;
  if (!base || !key) throw new LlmError("Q AI provider is not configured (set Q_AI_BASE_URL and Q_AI_API_KEY).");

  const messages: LlmMessage[] = opts.system
    ? [{ role: "system", content: opts.system }, ...opts.messages]
    : opts.messages;

  const body: Record<string, unknown> = {
    model: llmModel(),
    messages,
    max_tokens: opts.maxTokens ?? 1500,
  };
  if (opts.temperature != null) body.temperature = opts.temperature;
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = "auto";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    throw new LlmError(e instanceof Error && e.name === "AbortError" ? "Q AI request timed out." : "Couldn't reach the Q AI service.");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Never surface the raw body (may echo the request/headers); log status only.
    throw new LlmError(`Q AI request failed (HTTP ${res.status}).`);
  }

  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string | null; tool_calls?: LlmToolCall[] }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null;

  const choice = json?.choices?.[0];
  const msg = choice?.message ?? {};
  return {
    text: stripThinking(msg.content ?? ""),
    toolCalls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [],
    finishReason: choice?.finish_reason ?? "stop",
    inputTokens: json?.usage?.prompt_tokens ?? 0,
    outputTokens: json?.usage?.completion_tokens ?? 0,
  };
}
