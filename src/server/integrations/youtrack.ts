import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { can } from "@/lib/rbac";
import { flagEnabled } from "@/lib/flags";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { encryptSecret, decryptSecret } from "@/lib/secret-box";
import { TASK_STATUSES } from "@/server/project-tasks";
import { setIntegration } from "@/server/integrations";
import {
  YoutrackError,
  testConnection,
  listProjects,
  looksLikeServiceUser,
  type YoutrackProjectRef,
} from "@/server/connectors/youtrack";

/**
 * Configs › Integrations — the TENANT-level YouTrack integration (one instance, one token).
 * The token lives on `tenant_integration`; projects map to it per-project in
 * `project_integration` (resource = the YouTrack project key). Everything here is gated on
 * `integrations:manage` and never returns the token — only its last four characters.
 */

export class IntegrationError extends Error {
  constructor(
    message: string,
    public code: "FORBIDDEN" | "NOT_CONNECTED" | "TEST_FAILED" | "BAD_INPUT",
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}

const PROVIDER = "youtrack";

function assertCanManage(ctx: TenantContext): void {
  if (!can(ctx, "integrations:manage")) {
    throw new IntegrationError("Managing integrations needs the integrations:manage permission.", "FORBIDDEN");
  }
}

/** Non-secret settings held in tenant_integration.config. */
interface YoutrackTenantConfig {
  /** YouTrack state (lower-cased) → QUBIT task status. Overrides the connector defaults. */
  stateMap?: Record<string, string>;
  syncIntervalMinutes?: number;
  /** ISO date to import from on first sync; null/absent = full history. */
  firstImportSince?: string | null;
  /** Archive issues removed in YouTrack rather than deleting them. */
  archiveRemoved?: boolean;
}

function parseTenantConfig(raw: unknown): YoutrackTenantConfig {
  if (!raw || typeof raw !== "object") return {};
  return raw as YoutrackTenantConfig;
}

function last4(token: string): string {
  return token.slice(-4);
}

// ── Connected summary ──────────────────────────────────────────────────────────────────

export interface YoutrackStatus {
  connected: boolean;
  enabled: boolean; // the youtrack feature flag (sync on/off for the tenant)
  baseUrl: string | null;
  host: string | null;
  connectedUser: string | null;
  connectedName: string | null;
  tokenLast4: string | null;
  status: string | null; // connected | error
  lastCheckedAt: Date | null;
  lastError: string | null;
  config: YoutrackTenantConfig;
}

export async function getYoutrackStatus(ctx: TenantContext): Promise<YoutrackStatus> {
  assertCanManage(ctx);
  const row = await withTenant(ctx, (tx) =>
    tx.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId: ctx.tenantId, provider: PROVIDER } } }),
  );
  let host: string | null = null;
  if (row?.baseUrl) {
    try {
      host = new URL(row.baseUrl).host;
    } catch {
      host = row.baseUrl;
    }
  }
  return {
    connected: Boolean(row),
    enabled: flagEnabled("youtrack"),
    baseUrl: row?.baseUrl ?? null,
    host,
    connectedUser: row?.connectedUser ?? null,
    connectedName: row?.connectedName ?? null,
    tokenLast4: row?.tokenLast4 ?? null,
    status: row?.status ?? null,
    lastCheckedAt: row?.lastCheckedAt ?? null,
    lastError: row?.lastError ?? null,
    config: parseTenantConfig(row?.config),
  };
}

// ── Test / connect / replace / disconnect ────────────────────────────────────────────

export const TestInput = z.object({
  baseUrl: z.string().trim().url().max(300),
  token: z.string().trim().min(1).max(500),
});
export type TestInput = z.infer<typeof TestInput>;

export interface YoutrackTestReport {
  ok: boolean;
  reachable: boolean;
  tokenValid: boolean;
  user: { login: string; fullName: string | null } | null;
  projectCount: number;
  looksLikePerson: boolean;
  message?: string;
}

/** Test a candidate (URL, token) without saving — the connect screen's proof. */
export async function testYoutrack(ctx: TenantContext, input: TestInput): Promise<YoutrackTestReport> {
  assertCanManage(ctx);
  try {
    const { user, projects } = await testConnection(input.baseUrl, input.token);
    return {
      ok: true,
      reachable: true,
      tokenValid: true,
      user: { login: user.login, fullName: user.fullName },
      projectCount: projects.length,
      looksLikePerson: !looksLikeServiceUser(user.login),
    };
  } catch (e) {
    const err = e instanceof YoutrackError ? e : null;
    return {
      ok: false,
      reachable: err?.code !== "UNAVAILABLE" && err?.code !== "BLOCKED_HOST" && err?.code !== "BAD_CONFIG",
      tokenValid: err?.code !== "AUTH",
      user: null,
      projectCount: 0,
      looksLikePerson: false,
      message: err?.message ?? "Could not reach YouTrack.",
    };
  }
}

/** Test, then store the tenant credential (token encrypted). Replaces any existing one. */
export async function connectYoutrack(ctx: TenantContext, input: TestInput): Promise<YoutrackStatus> {
  assertCanManage(ctx);
  const report = await testYoutrack(ctx, input);
  if (!report.ok || !report.user) {
    throw new IntegrationError(report.message ?? "The connection test failed.", "TEST_FAILED");
  }
  await withTenant(ctx, async (tx) => {
    await tx.tenantIntegration.upsert({
      where: { tenantId_provider: { tenantId: ctx.tenantId, provider: PROVIDER } },
      create: {
        tenantId: ctx.tenantId,
        provider: PROVIDER,
        baseUrl: input.baseUrl,
        secret: encryptSecret(input.token),
        connectedUser: report.user!.login,
        connectedName: report.user!.fullName,
        tokenLast4: last4(input.token),
        status: "connected",
        lastCheckedAt: new Date(),
        lastError: null,
      },
      update: {
        baseUrl: input.baseUrl,
        secret: encryptSecret(input.token),
        connectedUser: report.user!.login,
        connectedName: report.user!.fullName,
        tokenLast4: last4(input.token),
        status: "connected",
        lastCheckedAt: new Date(),
        lastError: null,
      },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "tenant_integration",
      entityId: PROVIDER,
      after: { connected: true, baseUrl: input.baseUrl, user: report.user!.login },
    });
  });
  return getYoutrackStatus(ctx);
}

/** Re-run the test with the stored token; update status + last-checked + last-error. */
export async function retestYoutrack(ctx: TenantContext): Promise<YoutrackStatus> {
  assertCanManage(ctx);
  const cred = await loadCredential(ctx);
  const report = await testYoutrack(ctx, { baseUrl: cred.baseUrl, token: cred.token });
  await withTenant(ctx, (tx) =>
    tx.tenantIntegration.update({
      where: { tenantId_provider: { tenantId: ctx.tenantId, provider: PROVIDER } },
      data: {
        status: report.ok ? "connected" : "error",
        lastCheckedAt: new Date(),
        lastError: report.ok ? null : report.message ?? "Test failed.",
        ...(report.user ? { connectedUser: report.user.login, connectedName: report.user.fullName } : {}),
      },
    }),
  );
  return getYoutrackStatus(ctx);
}

/** Replace the token (keep the same instance URL), re-testing it first. */
export async function replaceYoutrackToken(ctx: TenantContext, token: string): Promise<YoutrackStatus> {
  assertCanManage(ctx);
  const cred = await loadCredential(ctx);
  return connectYoutrack(ctx, { baseUrl: cred.baseUrl, token: token.trim() });
}

/** Remove the tenant credential and mark every YouTrack project mapping disconnected. */
export async function disconnectYoutrack(ctx: TenantContext): Promise<void> {
  assertCanManage(ctx);
  await withTenant(ctx, async (tx) => {
    await tx.projectIntegration.updateMany({ where: { provider: PROVIDER }, data: { connected: false } });
    await tx.tenantIntegration.deleteMany({ where: { provider: PROVIDER } });
    await audit(tx, ctx, { action: "delete", entityType: "tenant_integration", entityId: PROVIDER, before: { connected: true } });
  });
}

/** Decrypt the stored credential for an internal call (test / list projects). */
async function loadCredential(ctx: TenantContext): Promise<{ baseUrl: string; token: string }> {
  const row = await withTenant(ctx, (tx) =>
    tx.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId: ctx.tenantId, provider: PROVIDER } } }),
  );
  if (!row) throw new IntegrationError("YouTrack is not connected for this tenant.", "NOT_CONNECTED");
  let token: string;
  try {
    token = decryptSecret(row.secret);
  } catch {
    throw new IntegrationError("Stored YouTrack token could not be read — replace it.", "TEST_FAILED");
  }
  return { baseUrl: row.baseUrl, token };
}

// ── Project mapping ──────────────────────────────────────────────────────────────────

export type MappingState = "ready" | "needs_review" | "not_mapped" | "no_access";

export interface ProjectMappingRow {
  projectId: string;
  code: string;
  name: string;
  /** The currently-mapped YouTrack key (project_integration.resource), or null. */
  ytKey: string | null;
  /** The project is set to sync (project_integration.connected). */
  sync: boolean;
  state: MappingState;
  /** A name/key-derived suggestion the admin can accept, when not yet mapped. */
  suggestion: { key: string; name: string; reason: "name" | "key" } | null;
}

export interface YoutrackMappingView {
  status: YoutrackStatus;
  ytProjects: YoutrackProjectRef[];
  rows: ProjectMappingRow[];
  counts: { all: number; ready: number; needsReview: number; notMapped: number; noAccess: number };
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Best suggestion for a QUBIT project among the YouTrack projects it can read. */
function suggestFor(code: string, name: string, yt: YoutrackProjectRef[]): ProjectMappingRow["suggestion"] {
  const nName = norm(name);
  const nCode = norm(code);
  for (const p of yt) {
    if (norm(p.shortName) === nCode) return { key: p.shortName, name: p.name, reason: "key" };
  }
  for (const p of yt) {
    const pn = norm(p.name);
    if (pn === nName || pn.includes(nName) || nName.includes(pn)) return { key: p.shortName, name: p.name, reason: "name" };
  }
  return null;
}

/** The mapping table: every active QUBIT project, its mapping, state, and a suggestion. */
export async function listYoutrackMappings(ctx: TenantContext): Promise<YoutrackMappingView> {
  assertCanManage(ctx);
  const status = await getYoutrackStatus(ctx);
  let ytProjects: YoutrackProjectRef[] = [];
  if (status.connected) {
    try {
      const cred = await loadCredential(ctx);
      ytProjects = await listProjects(cred.baseUrl, cred.token);
    } catch {
      ytProjects = [];
    }
  }
  const visibleKeys = new Set(ytProjects.map((p) => p.shortName));

  const projects = await withTenant(ctx, (tx) =>
    tx.project.findMany({
      where: { status: { notIn: ["Completed", "Cancelled"] } },
      select: {
        id: true,
        code: true,
        name: true,
        integrations: { where: { provider: PROVIDER }, select: { resource: true, connected: true } },
      },
      orderBy: { code: "asc" },
    }),
  );

  const rows: ProjectMappingRow[] = projects.map((p) => {
    const row = p.integrations[0];
    const ytKey = row?.resource ?? null;
    const sync = row?.connected ?? false;
    let state: MappingState;
    let suggestion: ProjectMappingRow["suggestion"] = null;
    if (ytKey) {
      state = !status.connected || visibleKeys.has(ytKey) ? "ready" : "no_access";
    } else {
      suggestion = status.connected ? suggestFor(p.code, p.name, ytProjects) : null;
      state = suggestion ? "needs_review" : "not_mapped";
    }
    return { projectId: p.id, code: p.code, name: p.name, ytKey, sync, state, suggestion };
  });

  const counts = {
    all: rows.length,
    ready: rows.filter((r) => r.state === "ready").length,
    needsReview: rows.filter((r) => r.state === "needs_review").length,
    notMapped: rows.filter((r) => r.state === "not_mapped").length,
    noAccess: rows.filter((r) => r.state === "no_access").length,
  };
  return { status, ytProjects, rows, counts };
}

export const SaveMappingsInput = z.object({
  mappings: z
    .array(
      z.object({
        projectId: z.string().uuid(),
        ytKey: z.string().trim().min(1).max(60).nullable(),
        sync: z.boolean().default(true),
      }),
    )
    .min(1)
    .max(200),
});
export type SaveMappingsInput = z.infer<typeof SaveMappingsInput>;

export interface SaveMappingsResult {
  saved: number;
  errors: { projectId: string; message: string }[];
}

/** Persist per-project mappings. A YouTrack key maps to at most one QUBIT project. */
export async function saveYoutrackMappings(ctx: TenantContext, input: SaveMappingsInput): Promise<SaveMappingsResult> {
  assertCanManage(ctx);
  const cred = await loadCredential(ctx); // also enforces NOT_CONNECTED

  // One YouTrack key cannot map to two QUBIT projects.
  const seen = new Map<string, string>();
  for (const m of input.mappings) {
    if (!m.ytKey) continue;
    const prior = seen.get(m.ytKey);
    if (prior && prior !== m.projectId) {
      throw new IntegrationError(`YouTrack project ${m.ytKey} is mapped to more than one QUBIT project.`, "BAD_INPUT");
    }
    seen.set(m.ytKey, m.projectId);
  }

  const result: SaveMappingsResult = { saved: 0, errors: [] };
  for (const m of input.mappings) {
    try {
      await setIntegration(ctx, m.projectId, PROVIDER, {
        connected: Boolean(m.ytKey) && m.sync,
        resource: m.ytKey,
        config: { baseUrl: cred.baseUrl },
      });
      result.saved += 1;
    } catch (e) {
      result.errors.push({ projectId: m.projectId, message: e instanceof Error ? e.message : "Could not save." });
    }
  }
  return result;
}

// ── Status mapping + sync settings (stored on tenant_integration.config) ──────────────

export const StatusMapInput = z.object({
  stateMap: z.record(z.string().trim().min(1), z.enum(TASK_STATUSES)),
});
export type StatusMapInput = z.infer<typeof StatusMapInput>;

export async function setYoutrackStatusMap(ctx: TenantContext, input: StatusMapInput): Promise<YoutrackStatus> {
  assertCanManage(ctx);
  await mergeConfig(ctx, { stateMap: input.stateMap });
  return getYoutrackStatus(ctx);
}

export const SyncSettingsInput = z.object({
  syncIntervalMinutes: z.number().int().min(5).max(1440).optional(),
  firstImportSince: z.string().datetime().nullable().optional(),
  archiveRemoved: z.boolean().optional(),
});
export type SyncSettingsInput = z.infer<typeof SyncSettingsInput>;

export async function setYoutrackSyncSettings(ctx: TenantContext, input: SyncSettingsInput): Promise<YoutrackStatus> {
  assertCanManage(ctx);
  await mergeConfig(ctx, input);
  return getYoutrackStatus(ctx);
}

/** Shallow-merge non-secret config onto the tenant credential. */
async function mergeConfig(ctx: TenantContext, patch: Partial<YoutrackTenantConfig>): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const row = await tx.tenantIntegration.findUnique({
      where: { tenantId_provider: { tenantId: ctx.tenantId, provider: PROVIDER } },
      select: { config: true },
    });
    if (!row) throw new IntegrationError("YouTrack is not connected for this tenant.", "NOT_CONNECTED");
    const next = { ...parseTenantConfig(row.config), ...patch };
    await tx.tenantIntegration.update({
      where: { tenantId_provider: { tenantId: ctx.tenantId, provider: PROVIDER } },
      data: { config: next as Prisma.InputJsonValue },
    });
    await audit(tx, ctx, { action: "update", entityType: "tenant_integration", entityId: PROVIDER, after: { configUpdated: Object.keys(patch) } });
  });
}
