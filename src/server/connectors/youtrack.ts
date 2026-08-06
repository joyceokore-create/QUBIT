import dns from "node:dns/promises";
import net from "node:net";
import type { IntegrationSummary } from "@/server/connectors/types";

/**
 * YouTrack connector (BRD FR-INT-05, docs/16 §12 M7). QA, developers and implementors file
 * their work in YouTrack; QUBIT mirrors it so progress, boards and the weekly reports read
 * from what the delivery teams actually do rather than from re-typed status.
 *
 * INBOUND ONLY. Nothing here writes to YouTrack — the token needs read scope alone.
 *
 * Split deliberately: everything above `fetchIssues` is PURE (no network, no clock) so the
 * field mapping — the part that differs per customer and is easiest to get wrong — is
 * unit-tested directly. Live calls return null/throw a typed error and never leak a token
 * into a message or a log line.
 */

// ── Types ────────────────────────────────────────────────────────────────────────────

/** The slice of a YouTrack issue we ask for. Everything is optional: a self-hosted instance
 *  with a customised workflow can omit any custom field, and a missing field must degrade,
 *  never throw. */
export interface YoutrackUser {
  login?: string;
  email?: string | null;
  fullName?: string | null;
}
export interface YoutrackCustomField {
  name?: string;
  value?: unknown;
}
export interface YoutrackIssue {
  id?: string;
  idReadable?: string;
  summary?: string | null;
  description?: string | null;
  created?: number;
  updated?: number;
  resolved?: number | null;
  reporter?: YoutrackUser | null;
  customFields?: YoutrackCustomField[];
}

/** Per-project overrides for the default maps below. YouTrack workflows are configurable,
 *  so no built-in map is right everywhere — these are edited in the integrations panel. */
export interface YoutrackFieldMap {
  state?: Record<string, string>;
  type?: Record<string, string>;
  priority?: Record<string, string>;
}

export interface MappedIssue {
  externalId: string;
  externalKey: string | null;
  externalUrl: string | null;
  title: string;
  description: string | null;
  status: string;
  type: string;
  priority: string;
  severity: string | null;
  dueDate: Date | null;
  /** Lower-cased assignee email, for matching a QUBIT user inside the tenant. */
  assigneeEmail: string | null;
  assigneeName: string | null;
  reporterEmail: string | null;
  updatedAt: Date | null;
}

export class YoutrackError extends Error {
  constructor(
    message: string,
    public code: "BAD_CONFIG" | "BLOCKED_HOST" | "AUTH" | "UNAVAILABLE",
  ) {
    super(message);
    this.name = "YoutrackError";
  }
}

// ── Pure mapping ─────────────────────────────────────────────────────────────────────

/**
 * Stock YouTrack states plus the common renames. A state we don't recognise falls back to
 * the issue's `resolved` timestamp (set → Completed, unset → NotStarted), which is the one
 * signal YouTrack guarantees regardless of workflow.
 *
 * Note "won't fix"/"duplicate"/"declined" map to Completed. They are NOT delivered work,
 * but they are no longer outstanding work either, and QUBIT's taxonomy has no Cancelled
 * status; leaving them open would permanently depress every project's progress. Overridable
 * per project (see DECISIONS DM1.42).
 */
const DEFAULT_STATE_MAP: Record<string, string> = {
  submitted: "NotStarted",
  open: "NotStarted",
  reopened: "NotStarted",
  new: "NotStarted",
  backlog: "NotStarted",
  "to do": "NotStarted",
  "in progress": "InProgress",
  "in development": "InProgress",
  started: "InProgress",
  "in review": "InReview",
  "to verify": "InReview",
  "under review": "InReview",
  "code review": "InReview",
  "in qa": "InQA",
  testing: "InQA",
  "ready for test": "InQA",
  "ready to test": "InQA",
  fixed: "Completed",
  verified: "Completed",
  done: "Completed",
  closed: "Completed",
  completed: "Completed",
  resolved: "Completed",
  "won't fix": "Completed",
  "wont fix": "Completed",
  duplicate: "Completed",
  declined: "Completed",
  obsolete: "Completed",
  "can't reproduce": "Completed",
};

const DEFAULT_TYPE_MAP: Record<string, string> = {
  bug: "Bug",
  defect: "Bug",
  exception: "Bug",
  feature: "Feature",
  "new feature": "Feature",
  story: "Feature",
  "user story": "Feature",
  epic: "Feature",
  enhancement: "Improvement",
  improvement: "Improvement",
  cosmetics: "Improvement",
  "usability problem": "Improvement",
  "performance problem": "Improvement",
  task: "Chore",
  chore: "Chore",
  spike: "Spike",
  research: "Spike",
};

const DEFAULT_PRIORITY_MAP: Record<string, string> = {
  "show-stopper": "Critical",
  showstopper: "Critical",
  blocker: "Critical",
  critical: "Critical",
  major: "High",
  high: "High",
  normal: "Medium",
  medium: "Medium",
  minor: "Low",
  low: "Low",
  "no priority": "Low",
};

/** Case- and whitespace-insensitive lookup; the override wins over the default. */
function lookup(
  defaults: Record<string, string>,
  overrides: Record<string, string> | undefined,
  raw: string | null,
): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return overrides?.[key] ?? overrides?.[raw.trim()] ?? defaults[key] ?? null;
}

export function mapState(raw: string | null, resolved: boolean, overrides?: Record<string, string>): string {
  return lookup(DEFAULT_STATE_MAP, overrides, raw) ?? (resolved ? "Completed" : "NotStarted");
}

export function mapType(raw: string | null, overrides?: Record<string, string>): string {
  return lookup(DEFAULT_TYPE_MAP, overrides, raw) ?? "Feature";
}

export function mapPriority(raw: string | null, overrides?: Record<string, string>): string {
  return lookup(DEFAULT_PRIORITY_MAP, overrides, raw) ?? "Medium";
}

/** Read one custom field by name (YouTrack field names are case-insensitive in practice). */
function field(issue: YoutrackIssue, name: string): unknown {
  const target = name.toLowerCase();
  return issue.customFields?.find((f) => f.name?.toLowerCase() === target)?.value;
}

/** A field value may be a bundle element ({name}), a user ({login,email}), a scalar, or a
 *  multi-value array — take the first of an array and read the obvious shape. */
function fieldName(value: unknown): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && "name" in v && typeof (v as { name: unknown }).name === "string") {
    return (v as { name: string }).name;
  }
  return null;
}

function fieldUser(value: unknown): YoutrackUser | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (v == null || typeof v !== "object") return null;
  const u = v as YoutrackUser;
  return u.login || u.email || u.fullName ? u : null;
}

/** Build the QUBIT-shaped row from one raw issue. Pure — the unit tests live on this. */
export function mapIssue(issue: YoutrackIssue, baseUrl: string, maps: YoutrackFieldMap = {}): MappedIssue | null {
  const externalId = issue.id?.trim();
  if (!externalId) return null; // nothing to key an upsert on — skip rather than guess

  const stateRaw = fieldName(field(issue, "State")) ?? fieldName(field(issue, "Stage"));
  const typeRaw = fieldName(field(issue, "Type"));
  const priorityRaw = fieldName(field(issue, "Priority"));
  const assignee = fieldUser(field(issue, "Assignee"));
  const dueRaw = field(issue, "Due Date");

  const type = mapType(typeRaw, maps.type);
  const priority = mapPriority(priorityRaw, maps.priority);
  const key = issue.idReadable?.trim() || null;

  return {
    externalId,
    externalKey: key,
    externalUrl: key ? `${baseUrl.replace(/\/+$/, "")}/issue/${encodeURIComponent(key)}` : null,
    // A YouTrack issue always has a summary in practice, but an empty one must not produce
    // a blank card — fall back to the key so the row is still identifiable.
    title: (issue.summary ?? "").trim() || key || "Untitled issue",
    description: issue.description?.trim() || null,
    status: mapState(stateRaw, Boolean(issue.resolved), maps.state),
    type,
    priority,
    // QUBIT tracks severity on bugs only; YouTrack's priority is the closest honest source.
    severity: type === "Bug" ? priority : null,
    dueDate: typeof dueRaw === "number" ? new Date(dueRaw) : null,
    assigneeEmail: assignee?.email?.trim().toLowerCase() || null,
    assigneeName: assignee?.fullName?.trim() || assignee?.login?.trim() || null,
    reporterEmail: issue.reporter?.email?.trim().toLowerCase() || null,
    updatedAt: typeof issue.updated === "number" ? new Date(issue.updated) : null,
  };
}

/** Live summary for the workspace "Feeds Q" card. Pure — counts only. */
export function summarizeYoutrack(project: string, issues: MappedIssue[]): IntegrationSummary {
  const open = issues.filter((i) => i.status !== "Completed");
  const bugs = open.filter((i) => i.type === "Bug");
  const critical = bugs.filter((i) => i.severity === "Critical" || i.severity === "High");
  const unassigned = open.filter((i) => !i.assigneeEmail);
  return {
    headline: `${project} · ${open.length} open`,
    lines: [
      `Open issues: ${open.length} of ${issues.length} synced`,
      `Open bugs: ${bugs.length}${critical.length ? ` (${critical.length} critical/high)` : ""}`,
      `Unassigned: ${unassigned.length}`,
    ],
  };
}

// ── Host safety ──────────────────────────────────────────────────────────────────────

/**
 * The base URL is customer-supplied configuration, so without a guard this connector is a
 * request forwarder anyone with project:update could point at internal infrastructure
 * (OWASP SSRF). Rules: http(s) only, no embedded credentials, and the resolved address must
 * be public — unless the host is named in INTEGRATION_ALLOWED_HOSTS, which is how a
 * self-hosted YouTrack on the corporate network is permitted deliberately rather than by
 * accident.
 *
 * Residual risk: a DNS rebind between this check and the fetch. Redirects are refused
 * (`redirect: "error"`), which closes the common vector; pinning the resolved IP to the
 * socket would close the rest and is deferred with the risk stated rather than implied.
 */
function allowedHosts(): Set<string> {
  return new Set(
    (process.env.INTEGRATION_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Loopback, private, link-local, CGNAT, unique-local and unspecified ranges. */
export function isPrivateAddress(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    // IPv4-mapped (::ffff:10.0.0.1) must be judged on the embedded v4 address.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true; // unparseable — refuse
}

/** Validate the configured base URL. Pure apart from DNS; throws YoutrackError on refusal. */
async function assertSafeBaseUrl(baseUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new YoutrackError("YouTrack URL is not a valid URL.", "BAD_CONFIG");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new YoutrackError("YouTrack URL must be http or https.", "BAD_CONFIG");
  }
  if (url.username || url.password) {
    throw new YoutrackError("Put the token in the token field, not in the URL.", "BAD_CONFIG");
  }
  const host = url.hostname.toLowerCase();
  const allowed = allowedHosts();
  if (allowed.has(host)) return url;

  if (url.protocol !== "https:") {
    throw new YoutrackError("YouTrack URL must use https (or be added to INTEGRATION_ALLOWED_HOSTS).", "BAD_CONFIG");
  }
  // A literal private IP is refused without resolving.
  const literal = net.isIP(host) ? host : null;
  const addresses = literal ? [literal] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) {
    throw new YoutrackError("YouTrack host could not be resolved.", "UNAVAILABLE");
  }
  if (addresses.some(isPrivateAddress)) {
    throw new YoutrackError(
      "YouTrack host resolves to a private address. Add it to INTEGRATION_ALLOWED_HOSTS to allow a self-hosted instance.",
      "BLOCKED_HOST",
    );
  }
  return url;
}

// ── Live calls ───────────────────────────────────────────────────────────────────────

const ISSUE_FIELDS = [
  "id",
  "idReadable",
  "summary",
  "description",
  "created",
  "updated",
  "resolved",
  "reporter(login,email,fullName)",
  "customFields(name,value(name,login,email,fullName,text))",
].join(",");

const PAGE_SIZE = 200;
/** Ceiling so a mis-scoped query can't pull an entire instance into one sync. */
const MAX_PAGES = 50;

export interface FetchIssuesOptions {
  baseUrl: string;
  token: string;
  /** YouTrack project short name, e.g. "RBC". */
  project: string;
  /** Only issues updated at or after this instant (day granularity — YouTrack's query
   *  syntax is date-based, so a small overlap is re-fetched and upserted harmlessly). */
  updatedAfter?: Date | null;
  signal?: AbortSignal;
}

export interface FetchIssuesResult {
  issues: YoutrackIssue[];
  /** True when MAX_PAGES was hit — the caller reports it rather than silently truncating. */
  truncated: boolean;
}

/** Escape a value for YouTrack's query language; braces quote a value containing spaces. */
function queryValue(v: string): string {
  return `{${v.replace(/[{}]/g, "")}}`;
}

export async function fetchIssues(opts: FetchIssuesOptions): Promise<FetchIssuesResult> {
  const url = await assertSafeBaseUrl(opts.baseUrl);
  const project = opts.project.trim();
  if (!project) throw new YoutrackError("YouTrack project short name is required.", "BAD_CONFIG");

  let query = `project: ${queryValue(project)}`;
  if (opts.updatedAfter) {
    // Step back a day: YouTrack's `updated:` filter is date-granular, so an exact
    // timestamp boundary could drop an issue edited later on the same day as the last sync.
    const from = new Date(opts.updatedAfter.getTime() - 86_400_000).toISOString().slice(0, 10);
    query += ` updated: ${from} .. Now`;
  }

  const headers = {
    Authorization: `Bearer ${opts.token}`,
    Accept: "application/json",
    "User-Agent": "qubit-app",
  };
  const base = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  const issues: YoutrackIssue[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const endpoint = `${base}/api/issues?fields=${encodeURIComponent(ISSUE_FIELDS)}&query=${encodeURIComponent(query)}&$top=${PAGE_SIZE}&$skip=${page * PAGE_SIZE}`;
    let res: Response;
    try {
      res = await fetch(endpoint, { headers, redirect: "error", signal: opts.signal });
    } catch {
      // Never echo the endpoint: it carries no token, but the message reaches the UI.
      throw new YoutrackError("Could not reach YouTrack.", "UNAVAILABLE");
    }
    if (res.status === 401 || res.status === 403) {
      throw new YoutrackError("YouTrack rejected the token (check it has read access to the project).", "AUTH");
    }
    if (!res.ok) {
      throw new YoutrackError(`YouTrack returned ${res.status}.`, "UNAVAILABLE");
    }
    const batch = (await res.json().catch(() => null)) as YoutrackIssue[] | null;
    if (!Array.isArray(batch)) throw new YoutrackError("YouTrack returned an unexpected payload.", "UNAVAILABLE");
    issues.push(...batch);
    if (batch.length < PAGE_SIZE) return { issues, truncated: false };
  }
  return { issues, truncated: true };
}

/** Live summary for the integrations card; null on any failure so the workspace degrades. */
export async function fetchYoutrackSummary(
  token: string,
  resource: string,
  baseUrl?: string,
): Promise<IntegrationSummary | null> {
  if (!baseUrl) return null;
  try {
    const { issues } = await fetchIssues({ baseUrl, token, project: resource });
    return summarizeYoutrack(resource, issues.map((i) => mapIssue(i, baseUrl)).filter((i): i is MappedIssue => !!i));
  } catch {
    return null;
  }
}
