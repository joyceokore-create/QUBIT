import { primaryRoleLabel } from "@/lib/rbac";
import { DECLINE_REASONS } from "@/lib/access-request-schema";

/**
 * UX fidelity Tier 2 — the Audit Log in plain words (design: When · Who · Action · Record ·
 * Before → after). Pure and client-safe.
 *
 * Security (plan R7): the Before → after column is built from an ALLOW-LIST of fields. A field
 * that isn't listed never leaves the server — so password hashes, MFA secrets, tokens or any
 * future sensitive field can't appear, even if a writer puts them in an audit row.
 */

const ACTION_LABEL: Record<string, string> = {
  role_grant: "Role added",
  role_revoke: "Role removed",
  access_request_review: "Access request decided",
  view_switch: "Viewing As changed",
  mfa_enroll: "MFA set up",
  mfa_reminder: "MFA reminder sent",
  tenant_switch: "Organisation switched",
};
const VERB: Record<string, string> = { create: "created", update: "changed", delete: "removed" };

function entityWord(entityType: string): string {
  const w = entityType.replace(/_/g, " ");
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** "Role added", "Project changed", "User created"… */
export function auditActionLabel(action: string, entityType: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  if (VERB[action]) return `${entityWord(entityType)} ${VERB[action]}`;
  return action.replace(/_/g, " ");
}

/** The Action filter's options: raw action → label (role changes grouped first). */
export function auditActionOptions(actions: string[]): { value: string; label: string }[] {
  const has = (a: string) => actions.includes(a);
  const out: { value: string; label: string }[] = [];
  if (has("role_grant") || has("role_revoke")) out.push({ value: "role_changes", label: "Role changes" });
  for (const a of actions) out.push({ value: a, label: ACTION_LABEL[a] ?? (VERB[a] ? `Anything ${VERB[a]}` : a.replace(/_/g, " ")) });
  return out;
}

/** Field → label for the Before → after column. Only these fields are ever shown. */
export const AUDIT_FIELD_ALLOW: Record<string, string> = {
  role: "Role",
  status: "Status",
  viewRole: "Viewing As",
  timeZone: "Time zone",
  name: "Name",
  title: "Title",
  stage: "Stage",
  lifecycle: "Stage",
  priority: "Priority",
  state: "State",
  rag: "Status",
  ragOverride: "Rating",
  dueDate: "Due",
  mfa_reset: "MFA reset",
  invite_sent: "Invite sent",
  password_reset_sent: "Password reset sent",
  reminded: "People reminded",
  reasonCode: "Reason",
  accessRequestRetentionDays: "Keep decided requests (days)",
};

const ROLE_FIELDS = new Set(["role", "viewRole"]);

function show(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (ROLE_FIELDS.has(key) && typeof v === "string") return primaryRoleLabel([v]);
  if (key === "reasonCode" && typeof v === "string") return DECLINE_REASONS.find((d) => d.value === v)?.label ?? v;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
  if (typeof v === "string" || typeof v === "number") return String(v);
  return "—"; // objects/arrays are never expanded
}

function field(o: unknown, k: string): unknown {
  return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>)[k] : undefined;
}

/** "Member → Project Manager", "— → Head of QA", "Status: Active → Suspended; Name: A → B". */
export function auditChange(action: string, before: unknown, after: unknown): string {
  if (action === "role_grant") return `— → ${show("role", field(after, "role"))}`;
  if (action === "role_revoke") return `${show("role", field(before, "role"))} → —`;
  const parts: string[] = [];
  for (const [key, label] of Object.entries(AUDIT_FIELD_ALLOW)) {
    const b = field(before, key);
    const a = field(after, key);
    if (a === undefined && b === undefined) continue;
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    parts.push(`${label}: ${show(key, b)} → ${show(key, a)}`);
  }
  // A single change reads without its label when it is the role itself.
  if (parts.length === 1 && parts[0].startsWith("Role: ")) return parts[0].slice(6);
  return parts.join("; ");
}

/** The period presets ("Last 7 days" …) → days back from today. */
export const AUDIT_PERIODS = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
] as const;
