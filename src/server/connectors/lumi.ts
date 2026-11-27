import "server-only";
import crypto from "node:crypto";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { decryptSecret } from "@/lib/secret-box";

/**
 * Lumi AI connector (Riverbank's in-house AI platform; docs: lumi-developer-docs.pdf,
 * Product API 0.1.0-draft). Shared by plan Phase 5 (in-product assistant: autopilot +
 * sessions + streamed runs) and Phase 3 (general tasks).
 *
 * Connection: the tenant's "lumi" integration (Configs › Integrations; base URL and client ID
 * in the row, client secret encrypted), else LUMI_BASE_URL / LUMI_CLIENT_ID /
 * LUMI_CLIENT_SECRET. The base URL includes /v1. The client secret, access tokens and
 * session tokens are never logged or returned.
 *
 * Retries per Lumi's error guide: 429 rate_limited and 503 upstream_unavailable once, after
 * Retry-After (capped); a 401 on an access token fetches a new token once. Nothing else.
 */

export interface LumiConnection {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  source: "tenant" | "env";
}

export class LumiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "LumiError";
  }
}

const TIMEOUT_MS = 30_000;
const RETRY_AFTER_CAP_MS = 5_000;

export function normaliseBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** The tenant's Lumi connection, or the environment's, or null. */
export async function lumiConnection(ctx: Pick<TenantContext, "tenantId" | "userId">): Promise<LumiConnection | null> {
  const row = await withTenant(ctx, (tx) => tx.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId: ctx.tenantId, provider: "lumi" } }, select: { baseUrl: true, secret: true, config: true } }));
  const clientId = (row?.config as { clientId?: string } | null)?.clientId;
  if (row && clientId) return { baseUrl: normaliseBaseUrl(row.baseUrl), clientId, clientSecret: decryptSecret(row.secret), source: "tenant" };
  const { LUMI_BASE_URL, LUMI_CLIENT_ID, LUMI_CLIENT_SECRET } = process.env;
  if (LUMI_BASE_URL && LUMI_CLIENT_ID && LUMI_CLIENT_SECRET) return { baseUrl: normaliseBaseUrl(LUMI_BASE_URL), clientId: LUMI_CLIENT_ID, clientSecret: LUMI_CLIENT_SECRET, source: "env" };
  return null;
}

// ── access tokens (15 minutes; reused until ~2 minutes before expiry) ──────────────────
const tokens = new Map<string, { token: string; until: number }>();
const tokenKey = (c: LumiConnection) => `${c.baseUrl}|${c.clientId}`;

/** For tests: forget cached access tokens. */
export function clearLumiTokenCache(): void {
  tokens.clear();
}

async function errorOf(res: Response): Promise<LumiError> {
  const body = (await res.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
  const code = typeof body?.error === "string" ? body.error : `http_${res.status}`;
  const message = typeof body?.message === "string" ? body.message : `Lumi answered ${res.status}.`;
  return new LumiError(message, res.status, code);
}

export async function getAccessToken(conn: LumiConnection, force = false, now = Date.now()): Promise<string> {
  const cached = tokens.get(tokenKey(conn));
  if (!force && cached && cached.until > now) return cached.token;
  const res = await fetch(`${conn.baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: conn.clientId, client_secret: conn.clientSecret }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw await errorOf(res);
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  tokens.set(tokenKey(conn), { token: json.access_token, until: now + Math.max(60, (json.expires_in ?? 900) - 120) * 1000 });
  return json.access_token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface CallOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** "access" = the product's access token; otherwise a person's session token. */
  as?: "access" | { session: string };
  /** Send an Idempotency-Key (runs, resumes) — the same key on the one retry. */
  idempotent?: boolean;
  /** Return the raw response for an event stream (no timeout, no JSON). */
  stream?: boolean;
  /** Multipart body (file uploads) — sent as-is instead of JSON. */
  form?: () => FormData;
  /** Overrides the 30 s timeout (a wait-mode run can take up to 120 s). */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** One call to Lumi, with the retry rules above. Answers the Response (ok), or throws LumiError. */
export async function lumiFetch(conn: LumiConnection, path: string, opts: CallOptions = {}): Promise<Response> {
  const as = opts.as ?? "access";
  const key = opts.idempotent ? crypto.randomUUID() : null;
  let refreshed = false;
  let forceToken = false;
  let retried = false;
  for (;;) {
    const bearer = as === "access" ? await getAccessToken(conn, forceToken) : as.session;
    forceToken = false;
    const res = await fetch(`${conn.baseUrl}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        authorization: `Bearer ${bearer}`,
        ...(opts.body !== undefined && !opts.form ? { "content-type": "application/json" } : {}),
        ...(key ? { "idempotency-key": key } : {}),
        ...(opts.stream ? { accept: "text/event-stream" } : {}),
      },
      body: opts.form ? opts.form() : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal ?? (opts.stream ? undefined : AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS)),
    });
    if (res.ok) return res;
    const err = await errorOf(res);
    if (res.status === 401 && as === "access" && !refreshed && err.code !== "session_expired") {
      refreshed = true;
      forceToken = true;
      continue;
    }
    if (!retried && ((res.status === 429 && err.code === "rate_limited") || (res.status === 503 && err.code === "upstream_unavailable"))) {
      retried = true;
      const after = Number(res.headers.get("retry-after"));
      await sleep(Math.min(RETRY_AFTER_CAP_MS, Number.isFinite(after) && after > 0 ? after * 1000 : 1000));
      continue;
    }
    throw err;
  }
}

const json = async <T>(res: Response): Promise<T> => (res.status === 204 ? (undefined as T) : ((await res.json()) as T));

// ── platform ──────────────────────────────────────────────────────────────────────────
export interface LumiMe {
  product: string;
  environment: string;
  subsidiary_code: string | null;
  credential_id: string;
  uses: string[];
  expires_at: string;
}
export const lumiMe = async (conn: LumiConnection) => json<LumiMe>(await lumiFetch(conn, "/me"));

// ── autopilot (switched on by the product itself) ─────────────────────────────────────
export interface LumiAutopilot {
  product?: string;
  enabled: boolean;
  config?: { version: string | null; fetched_at: string | null; status: "passed" | "warning" | "failed" | string; checks?: { artifact: string; status: string; path?: string; message: string }[]; scopes?: string[] };
  [k: string]: unknown;
}
export const getAutopilot = async (conn: LumiConnection) => json<LumiAutopilot>(await lumiFetch(conn, "/autopilot"));
export const putAutopilot = async (conn: LumiConnection, input: { api_base_url: string; config_url: string; webhook_url?: string }) =>
  json<LumiAutopilot>(await lumiFetch(conn, "/autopilot", { method: "PUT", body: input }));
export const refreshAutopilot = async (conn: LumiConnection) => json<LumiAutopilot>(await lumiFetch(conn, "/autopilot/refresh", { method: "POST", body: {} }));
export const deleteAutopilot = async (conn: LumiConnection) => json<unknown>(await lumiFetch(conn, "/autopilot", { method: "DELETE" }));

// ── sessions (Lumi acting as one person) ──────────────────────────────────────────────
export interface LumiSession {
  session_id: string;
  session_token: string;
  expires_at: string;
}
export async function startLumiSession(
  conn: LumiConnection,
  input: { user: { id: string; display_name?: string; roles?: string[] }; delegation: { user_token: string; expires_at: string }; ttl_seconds?: number },
): Promise<LumiSession> {
  return json<LumiSession>(await lumiFetch(conn, "/sessions", { method: "POST", body: input }));
}
export const endLumiSession = async (conn: LumiConnection, sessionId: string) => {
  await lumiFetch(conn, `/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
};

// ── runs, as the person (session token) ───────────────────────────────────────────────
export const startRunStream = (conn: LumiConnection, sessionToken: string, input: { message: string; conversation_id?: string }, signal?: AbortSignal) =>
  lumiFetch(conn, "/runs", { method: "POST", as: { session: sessionToken }, body: { ...input, mode: "stream" }, idempotent: true, stream: true, signal });
export const resumeRunStream = (conn: LumiConnection, sessionToken: string, runId: string, input: { pending_id: string; approve?: boolean; answer?: string; note?: string }, signal?: AbortSignal) =>
  lumiFetch(conn, `/runs/${encodeURIComponent(runId)}/resume`, { method: "POST", as: { session: sessionToken }, body: { ...input, mode: "stream" }, idempotent: true, stream: true, signal });
export const rateRun = async (conn: LumiConnection, sessionToken: string, runId: string, input: { rating: "up" | "down"; comment?: string }) =>
  json<{ review_id?: string }>(await lumiFetch(conn, `/runs/${encodeURIComponent(runId)}/feedback`, { method: "POST", as: { session: sessionToken }, body: input }));
export const listConversations = async (conn: LumiConnection, sessionToken: string, cursor?: string) =>
  json<{ data: unknown[]; next_cursor: string | null }>(await lumiFetch(conn, `/conversations?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { as: { session: sessionToken } }));
export const listMessages = async (conn: LumiConnection, sessionToken: string, conversationId: string, cursor?: string) =>
  json<{ data: unknown[]; next_cursor: string | null }>(
    await lumiFetch(conn, `/conversations/${encodeURIComponent(conversationId)}/messages?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { as: { session: sessionToken } }),
  );

// ── general tasks (plan Phase 3: one-off runs on uploaded files) ─────────────────────────
export interface LumiFile {
  file_id: string;
  status: "processing" | "ready" | "rejected";
  error?: unknown;
}

/** POST /files (multipart). Lumi scans it, reads its text once (OCR where needed) and masks personal data. */
export async function uploadLumiFile(conn: LumiConnection, buf: Buffer, fileName: string, mediaType: string): Promise<LumiFile> {
  return json<LumiFile>(
    await lumiFetch(conn, "/files", {
      method: "POST",
      idempotent: true,
      timeoutMs: 120_000,
      form: () => {
        const fd = new FormData();
        fd.append("file", new Blob([new Uint8Array(buf)], { type: mediaType }), fileName);
        return fd;
      },
    }),
  );
}

export interface LumiRun {
  run_id: string;
  conversation_id: string;
  status: "queued" | "running" | "done" | "failed" | "needs_approval" | "needs_input" | "cancelled" | string;
  output: { text: string; data: unknown };
  usage?: { model_calls?: number; input_tokens?: number; output_tokens?: number; tool_calls?: number };
  /** A run that stopped to ask (needs_approval, needs_input, needs_context …): what it asks. */
  pending?: { pending_id?: string; type?: string; text?: string } | null;
  model?: string;
  error?: { error?: string; message?: string } | null;
}

const RUN_POLL_MS = 2_000;
const RUN_DEADLINE_MS = 30 * 60_000;
/** Lumi is still working only while queued or running; any other status (done, failed, or a
 * pause such as needs_approval / needs_context — new ones may appear) is final for a poll. */
const WORKING = new Set(["queued", "running"]);

/**
 * POST /runs in wait mode. Lumi answers 200 with the finished run, or 202 after ~120 s while
 * it keeps working; then GET /runs/{id} is polled until it settles or 30 minutes pass.
 * A run that pauses for approval or input is returned as it is — the caller decides.
 */
export async function createLumiRun(
  conn: LumiConnection,
  input: { message: string; file_ids?: string[]; output?: { format: "text" | "json"; schema?: unknown }; metadata?: Record<string, string> },
  opts: { pollMs?: number; deadlineMs?: number; now?: () => number } = {},
): Promise<LumiRun> {
  const now = opts.now ?? Date.now;
  const started = now();
  let run = await json<LumiRun>(await lumiFetch(conn, "/runs", { method: "POST", idempotent: true, timeoutMs: 150_000, body: { ...input, mode: "wait" } }));
  while (WORKING.has(run.status)) {
    if (now() - started > (opts.deadlineMs ?? RUN_DEADLINE_MS)) throw new LumiError("Lumi did not finish reading the file in time.", 504, "run_timeout");
    await sleep(opts.pollMs ?? RUN_POLL_MS);
    run = await json<LumiRun>(await lumiFetch(conn, `/runs/${encodeURIComponent(run.run_id)}`));
  }
  return run;
}

/** DELETE /conversations/{id}: the transcript, its files and Lumi's personal-data lookup go with it. */
export const deleteLumiConversation = async (conn: LumiConnection, conversationId: string) => {
  await lumiFetch(conn, `/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
};
