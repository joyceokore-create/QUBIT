import { ASSISTANT_OPERATIONS, LUMI_ROLES, toolName, type LumiRole } from "@/server/assistant/operations";

/**
 * Plan Phase 5 — the three files QUBIT publishes for Lumi (docs: "Publishing your
 * configuration"): lumi.yaml (the starting point, its URL is the config_url), openapi.json
 * (Lumi builds its tools from it) and overview.md. All generated from the operations
 * registry; none holds a secret. Served from /lumi/*.
 *
 * lumi.yaml uses LISTING mode with roles: Lumi's docs say selection mode and session scopes
 * are agreed but not live yet. Retention is the signed-off values (env, defaults 30 / 7).
 */

export function appBaseUrl(): string {
  return (process.env.AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Where Lumi calls QUBIT's assistant API (on the shared network). */
export function assistantApiBaseUrl(): string {
  return (process.env.ASSISTANT_API_BASE_URL ?? `${appBaseUrl()}/api/assistant/v1`).replace(/\/+$/, "");
}

export function lumiConfigUrl(): string {
  return `${appBaseUrl()}/lumi/lumi.yaml`;
}

const intEnv = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export function buildOpenApi(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of ASSISTANT_OPERATIONS) {
    const params = [...(op.parameters ?? [])];
    if (op.writes) params.push({ name: "dryRun", in: "query", required: false, description: "Check the change and describe it without saving.", schema: { type: "boolean" } });
    paths[op.path] ??= {};
    paths[op.path]![op.method.toLowerCase()] = {
      operationId: op.operationId,
      tags: [op.tag],
      summary: op.summary,
      ...(params.length ? { parameters: params } : {}),
      ...(op.body ? { requestBody: { required: true, content: { "application/json": { schema: op.body } } } } : {}),
      responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object" } } } }, "401": { description: "No or expired delegation token" }, "403": { description: "Not allowed for this person" } },
      security: [{ delegation: [] }],
    };
  }
  return {
    openapi: "3.0.3",
    info: { title: "QUBIT assistant API", version: "1.0.0", description: "What QUBIT's in-product assistant may read and propose, as the signed-in person." },
    servers: [{ url: assistantApiBaseUrl() }],
    components: { securitySchemes: { delegation: { type: "http", scheme: "bearer", description: "The person's QUBIT delegation token (sealed by Lumi for the session)." } } },
    paths,
  };
}

export function buildOverview(): string {
  return [
    "# QUBIT",
    "",
    "QUBIT is Riverbank's project portfolio management platform. Project Managers run projects and send a weekly",
    "check-in (a one-line status for the Head and a RAG of Green, Amber or Red). The Head of Projects reviews the",
    "week's check-ins and approves a weekly roll-up with a managerial summary for the executives.",
    "",
    "## Terms",
    "- **RAG**: Green (on track), Amber (at risk), Red (off track). QUBIT computes one from live signals; a PM may",
    "  override it with a reason.",
    "- **Check-in**: a project's weekly status line. Saved as a draft, then confirmed and sent by its PM.",
    "- **Gates**: delivery checkpoints such as BRD, Prototype, MVP1, SIT, UAT and Go-Live.",
    "- **Stage note**: a few words on where a project is.",
    "- **Blocker / risk**: RAID items raised on a project.",
    "",
    "## Roles",
    "- Head of Projects: every project; approves the weekly roll-up.",
    "- Executive: reads the portfolio and the roll-up.",
    "- Head of QA: testing gates and quality.",
    "- Project Manager: the projects they run; saves check-in drafts and stage notes.",
    "- Member: their own work; can raise blockers and risks on projects they are part of.",
    "",
    "The assistant acts as the signed-in person with their own permissions. It never sends a check-in: drafts wait",
    "for the PM to send them.",
    "",
  ].join("\n");
}

/** The lumi.yaml document, as data (rendered by toYaml). */
export function buildLumiConfig(): Record<string, unknown> {
  const roles = Object.fromEntries((Object.keys(LUMI_ROLES) as LumiRole[]).map((r) => [r, ASSISTANT_OPERATIONS.filter((op) => op.roles.includes(r)).map(toolName)]));
  return {
    schema_version: 1,
    product: process.env.LUMI_PRODUCT_SLUG ?? "qubit",
    uses: ["autopilot", "ask_lumi"],
    owners: { technical: process.env.LUMI_OWNER_EMAIL ?? "qubit-dev@example.invalid" },
    openapi: "openapi.json",
    overview: "overview.md",
    tools: ASSISTANT_OPERATIONS.map((op) => ({
      endpoint: `${op.method} ${op.path}`,
      name: toolName(op),
      description: op.summary,
      ...(op.writes ? { writes: true, dry_run: { query: "dryRun" } } : {}),
    })),
    roles,
    auth: { mode: "pass_through" },
    pii_fields: ["personName", "pmName", "postedBy", "ownerName", "email"],
    retention: { conversations_days: intEnv("LUMI_RETENTION_CONVERSATIONS_DAYS", 30), files_days: intEnv("LUMI_RETENTION_FILES_DAYS", 7) },
    tests: [
      { request: "Which of my projects are red this week?", expect_tools: ["list_projects"] },
      { request: "What is blocking Curis?", expect_tools: ["list_projects", "list_blockers"] },
      { request: "Draft this week's check-in for Curis: UAT slipped a week.", expect_tools: ["list_projects", "save_check_in_draft"] },
    ],
  };
}

/** A small YAML writer for plain data: maps, lists, strings (always double-quoted, which is
 * JSON string syntax and valid YAML), numbers and booleans. Enough for lumi.yaml. */
export function toYaml(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  const scalar = (v: unknown) => (typeof v === "string" ? JSON.stringify(v) : v === null || v === undefined ? "null" : String(v));
  const isPlain = (v: unknown) => v === null || typeof v !== "object";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value
      .map((item) => {
        if (isPlain(item)) return `${pad}- ${scalar(item)}`;
        const inner = toYaml(item, indent + 1).split("\n");
        return `${pad}- ${inner[0]!.trimStart()}${inner.length > 1 ? `\n${inner.slice(1).join("\n")}` : ""}`;
      })
      .join("\n");
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return entries
      .map(([k, v]) => {
        const key = /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : JSON.stringify(k);
        if (isPlain(v)) return `${pad}${key}: ${scalar(v)}`;
        if (Array.isArray(v) && v.length === 0) return `${pad}${key}: []`;
        if (!Array.isArray(v) && Object.keys(v as object).length === 0) return `${pad}${key}: {}`;
        return `${pad}${key}:\n${toYaml(v, indent + 1)}`;
      })
      .join("\n");
  }
  return `${pad}${scalar(value)}`;
}
