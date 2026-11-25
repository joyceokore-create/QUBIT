/**
 * Plan Phase 5 — the in-product assistant's API, described ONCE. This list is the source for
 * the OpenAPI description Lumi builds its tools from (/lumi/openapi.json), for lumi.yaml's
 * tool listing and roles, and is checked against the route files by tests/unit. Paths are
 * relative to the assistant API base (/api/assistant/v1).
 *
 * People's names use distinct field names (personName, pmName, postedBy, ownerName) so
 * lumi.yaml's pii_fields can mask them without masking project names.
 */

/** Lumi roles (lumi.yaml, listing mode) and the QUBIT roles each maps from. */
export const LUMI_ROLES = {
  head: ["PlatformSuperAdmin", "HeadOfProjects"],
  executive: ["Executive"],
  qa: ["HeadOfQA"],
  pm: ["ProjectManager"],
  member: ["Member"],
} as const;
export type LumiRole = keyof typeof LUMI_ROLES;

/** The Lumi roles a QUBIT person holds (at least "member"). */
export function lumiRolesFor(qubitRoles: string[]): LumiRole[] {
  const out = (Object.keys(LUMI_ROLES) as LumiRole[]).filter((k) => (LUMI_ROLES[k] as readonly string[]).some((r) => qubitRoles.includes(r)));
  return out.length ? out : ["member"];
}

type Json = Record<string, unknown>;

export interface AssistantOperation {
  operationId: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  tag: "projects" | "reports" | "raid" | "people";
  summary: string;
  /** Changes data: Lumi asks the person to approve, after a dry run (?dryRun=1). */
  writes: boolean;
  parameters?: { name: string; in: "path" | "query"; required: boolean; description: string; schema: Json }[];
  body?: Json;
  /** Which Lumi roles may use the tool (QUBIT still checks every call itself). */
  roles: LumiRole[];
}

const ALL: LumiRole[] = ["head", "executive", "qa", "pm", "member"];
const PROJECT_ID = { name: "id", in: "path" as const, required: true, description: "The project's id (from list_projects).", schema: { type: "string", format: "uuid" } };
const PROJECT_FILTER = { name: "projectId", in: "query" as const, required: false, description: "Only this project's (omit for every project you can see).", schema: { type: "string", format: "uuid" } };
const RAG = { type: "string", enum: ["Green", "Amber", "Red"] };

export const ASSISTANT_OPERATIONS: AssistantOperation[] = [
  { operationId: "listProjects", method: "GET", path: "/projects", tag: "projects", summary: "List the active projects you can see: code, name, delivery status, priority, average progress and due date. Start here to find a project's id.", writes: false, roles: ALL },
  { operationId: "getProject", method: "GET", path: "/projects/{id}", tag: "projects", summary: "One project's overview: status, stage note, progress, dates, budget, description, and this week's check-in (status line and RAG).", writes: false, parameters: [PROJECT_ID], roles: ALL },
  { operationId: "listStatusUpdates", method: "GET", path: "/projects/{id}/status-updates", tag: "projects", summary: "A project's recent status updates, newest first: RAG, the update text, who posted it and when.", writes: false, parameters: [PROJECT_ID], roles: ALL },
  { operationId: "listRisks", method: "GET", path: "/risks", tag: "raid", summary: "Risks with probability, impact and status, across your projects or for one project.", writes: false, parameters: [PROJECT_FILTER], roles: ALL },
  { operationId: "listBlockers", method: "GET", path: "/blockers", tag: "raid", summary: "Blockers with severity and status, across your projects or for one project.", writes: false, parameters: [PROJECT_FILTER], roles: ALL },
  { operationId: "listNudges", method: "GET", path: "/nudges", tag: "projects", summary: "What QUBIT is chasing this week: overdue or stale work, old blockers, at-risk milestones and unconfirmed check-ins.", writes: false, parameters: [PROJECT_FILTER], roles: ALL },
  { operationId: "listWorkload", method: "GET", path: "/workload", tag: "people", summary: "People's allocation across projects and who is over-allocated. Limited to the people you may see.", writes: false, roles: ALL },
  {
    operationId: "getWeeklyRollup",
    method: "GET",
    path: "/reports/week",
    tag: "reports",
    summary: "A week's portfolio roll-up: every active project's RAG, whether its PM's check-in is in, and the PM's line. Needs report access.",
    writes: false,
    parameters: [{ name: "week", in: "query", required: false, description: "ISO week like 2026-W48 (default: this week).", schema: { type: "string", pattern: "^\\d{4}-W\\d{2}$" } }],
    roles: ["head", "executive", "qa", "pm"],
  },
  {
    operationId: "saveCheckInDraft",
    method: "POST",
    path: "/projects/{id}/checkin-draft",
    tag: "projects",
    summary: "Save this week's check-in DRAFT for a project you run: the line for the Head, and a RAG with a reason when it differs from QUBIT's. It is not sent; the PM sends it.",
    writes: true,
    parameters: [PROJECT_ID],
    body: { type: "object", additionalProperties: false, properties: { narrative: { type: "string", maxLength: 500 }, ragOverride: RAG, overrideReason: { type: "string", maxLength: 300 } }, required: ["narrative"] },
    roles: ["head", "pm"],
  },
  {
    operationId: "raiseRisk",
    method: "POST",
    path: "/risks",
    tag: "raid",
    summary: "Raise a risk on a project you are part of, with probability and impact from 1 to 5.",
    writes: true,
    body: { type: "object", additionalProperties: false, properties: { projectId: { type: "string", format: "uuid" }, title: { type: "string", minLength: 3, maxLength: 200 }, probability: { type: "integer", minimum: 1, maximum: 5 }, impact: { type: "integer", minimum: 1, maximum: 5 }, mitigation: { type: "string" } }, required: ["projectId", "title", "probability", "impact"] },
    roles: ALL,
  },
  {
    operationId: "raiseBlocker",
    method: "POST",
    path: "/projects/{id}/blockers",
    tag: "raid",
    summary: "Raise a blocker on a project you are part of: what is blocking the work, and how severe.",
    writes: true,
    parameters: [PROJECT_ID],
    body: { type: "object", additionalProperties: false, properties: { description: { type: "string", minLength: 1 }, severity: { type: "string", enum: ["Low", "Medium", "Critical"] } }, required: ["description"] },
    roles: ALL,
  },
  {
    operationId: "setStageNote",
    method: "PATCH",
    path: "/projects/{id}/stage-note",
    tag: "projects",
    summary: "Set a project's stage note (where it is, in a few words) on a project you run.",
    writes: true,
    parameters: [PROJECT_ID],
    body: { type: "object", additionalProperties: false, properties: { statusNote: { type: "string", maxLength: 200 } }, required: ["statusNote"] },
    roles: ["head", "pm"],
  },
];

/** Lumi's tool name for an operation: operationId words split, lower-cased, joined by _. */
export function toolName(op: Pick<AssistantOperation, "operationId">): string {
  return op.operationId.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}
