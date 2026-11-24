// UX11 (D13) — the Super Admin Custom report datasets (users, accessRequests) and the Users
// page's No MFA tab. Proves: the users dataset is tenant-scoped (never another tenant's users,
// never DELETED ones); No MFA is exactly the ACTIVE users without MFA, the same set the tile
// counts and the report shows; and the engine, the PDF path and the API refuse both datasets
// without their permission. Requires a migrated, seeded DB. Synthetic data only; cleaned up.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The API door resolves the caller from the session; stand that in per test, keeping the
// real withTenant so every query still runs under RLS.
vi.mock("@/lib/tenant", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tenant")>()),
  getTenantContext: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getTenantContext, withTenant, type TenantContext } from "@/lib/tenant";
import { allowedDatasetKeys, CustomReportError, offeredDatasetKeys, runCustomReport, type ReportRow } from "@/server/custom-reports";
import { listUsersPaged, userDirectoryStats } from "@/server/users";
import { buildExport, ExportError } from "@/server/pdf/export";
import { GET } from "@/app/api/reports/custom/route";
import { disableSso, restoreSso } from "./_sso-env";

const TAG = `ads${Date.now().toString(36)}`;
const email = (k: string) => `test_${TAG}_${k}@example.invalid`;
const name = (k: string) => `user_${TAG}_${k}`;

let rbId: string;
let bId: string;
let admin: TenantContext; // Riverbank Super Admin
let bAdmin: TenantContext; // Demo Org B Super Admin
let member: TenantContext; // Riverbank Member — no admin:access, no iam:manage
let head: TenantContext; // Riverbank Head of Projects — admin:access but not iam:manage
const userIds: { tenantId: string; id: string }[] = [];
let teamId: string;
let requestId: string;

async function makeUser(tenantId: string, key: string, data: { status?: string; mfa?: boolean } = {}): Promise<string> {
  const u = await withTenant({ tenantId, userId: "seed" }, (tx) =>
    tx.user.create({
      data: { tenantId, name: name(key), email: email(key), status: data.status ?? "ACTIVE", mfaSecret: data.mfa ? "synthetic-not-a-secret" : null },
      select: { id: true },
    }),
  );
  userIds.push({ tenantId, id: u.id });
  return u.id;
}

/** The report's rows for this run's fixture users only (the tenant has other users too). */
const mine = (rows: ReportRow[]) => rows.filter((r) => String(r.email).includes(TAG));

beforeAll(async () => {
  disableSso(); // assert the app-level MFA path; the SSO cell is tested on its own below
  const [r, d] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
  if (!r || !d) throw new Error("Seed required — run `pnpm prisma db seed` first.");
  rbId = r.id;
  bId = d.id;
  admin = { tenantId: rbId, userId: "test-ads-admin", roles: ["PlatformSuperAdmin"] };
  bAdmin = { tenantId: bId, userId: "test-ads-admin", roles: ["PlatformSuperAdmin"] };
  member = { tenantId: rbId, userId: "test-ads-member", roles: ["Member"] };
  head = { tenantId: rbId, userId: "test-ads-head", roles: ["HeadOfProjects"] };

  await makeUser(rbId, "active_nomfa");
  await makeUser(rbId, "active_mfa", { mfa: true });
  await makeUser(rbId, "invited_nomfa", { status: "INVITED" });
  await makeUser(rbId, "suspended_nomfa", { status: "SUSPENDED" });
  await makeUser(rbId, "deleted_nomfa", { status: "DELETED" });
  const teamed = await makeUser(rbId, "active_team");
  await makeUser(bId, "tenantb_nomfa");

  await withTenant(admin, async (tx) => {
    teamId = (await tx.team.create({ data: { tenantId: rbId, name: `Team ${TAG}` }, select: { id: true } })).id;
    await tx.teamMember.create({ data: { tenantId: rbId, teamId, userId: teamed } });
    await tx.roleAssignment.create({ data: { tenantId: rbId, userId: teamed, role: "Executive" } });
  });

  // access_request is a system table (no tenant_id) — written with bare prisma, as the
  // public request-access form does.
  requestId = (
    await prisma.accessRequest.create({
      data: { fullName: name("request"), email: email("request"), company: `Company ${TAG}`, jobTitle: "Synthetic role" },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await prisma.accessRequest.deleteMany({ where: { id: requestId } });
  await withTenant(admin, (tx) => tx.team.deleteMany({ where: { id: teamId } }));
  for (const tenantId of [rbId, bId]) {
    const ids = userIds.filter((u) => u.tenantId === tenantId).map((u) => u.id);
    await withTenant({ tenantId, userId: "seed" }, async (tx) => {
      await tx.roleAssignment.deleteMany({ where: { userId: { in: ids } } });
      await tx.user.deleteMany({ where: { id: { in: ids } } });
    });
  }
  restoreSso();
  await prisma.$disconnect();
});

describe("UX11 users dataset", () => {
  it("lists this tenant's users (DELETED excluded), never another tenant's", async () => {
    const rows = (await runCustomReport(admin, "users", ["name", "email", "status", "mfa", "teams", "roles"])).rows;
    expect(mine(rows).map((r) => r.name).sort()).toEqual(
      ["active_nomfa", "active_mfa", "invited_nomfa", "suspended_nomfa", "active_team"].map(name).sort(),
    );
    expect(rows.some((r) => r.email === email("tenantb_nomfa"))).toBe(false);
    expect(rows.some((r) => r.email === email("deleted_nomfa"))).toBe(false);

    // Demo Org B's admin sees their own user and none of Riverbank's.
    const bRows = mine((await runCustomReport(bAdmin, "users", ["email"])).rows);
    expect(bRows.map((r) => r.email)).toEqual([email("tenantb_nomfa")]);
  });

  it("forged context: Riverbank's fixture ids read under Demo Org B's RLS return nothing of Riverbank's", async () => {
    const forged: TenantContext = { ...admin, tenantId: bId };
    const rows = mine((await runCustomReport(forged, "users", ["email"])).rows);
    expect(rows.every((r) => r.email === email("tenantb_nomfa"))).toBe(true);
  });

  it("cells: status / MFA labels, team names, role labels, dates as Date (never pre-formatted)", async () => {
    const rows = mine((await runCustomReport(admin, "users", ["email", "status", "mfa", "teams", "roles", "lastActive", "createdAt"])).rows);
    const by = (k: string) => rows.find((r) => r.email === email(k));
    expect(by("active_nomfa")).toMatchObject({ status: "Active", mfa: "Off", teams: null, lastActive: null });
    expect(by("active_mfa")).toMatchObject({ mfa: "On" });
    expect(by("invited_nomfa")).toMatchObject({ status: "Invited" });
    expect(by("suspended_nomfa")).toMatchObject({ status: "Suspended" });
    expect(by("active_team")).toMatchObject({ teams: `Team ${TAG}`, roles: "Executive" });
    for (const r of rows) expect(r.createdAt).toBeInstanceOf(Date);
  });

  it("MFA reads SSO when the identity provider enforces it", async () => {
    vi.stubEnv("AZURE_AD_CLIENT_ID", "synthetic");
    vi.stubEnv("AZURE_AD_CLIENT_SECRET", "synthetic");
    vi.stubEnv("AZURE_AD_TENANT_ID", "synthetic");
    try {
      const rows = mine((await runCustomReport(admin, "users", ["email", "mfa"])).rows);
      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((r) => r.mfa))).toEqual(new Set(["SSO"]));
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("UX11 No MFA — one rule for the tab, the tile and the report", () => {
  it("the No MFA tab is exactly the ACTIVE users without MFA", async () => {
    const { rows } = await listUsersPaged(admin, { q: TAG, size: 100, tab: "nomfa" });
    expect(rows.map((r) => r.name).sort()).toEqual([name("active_nomfa"), name("active_team")].sort());
    for (const r of rows) {
      expect(r.status).toBe("ACTIVE");
      expect(r.mfaEnabled).toBe(false);
    }
  });

  it("matches the tile count, the tile's URL filters and the report, across the whole tenant", async () => {
    const stats = await userDirectoryStats(admin, { sso: false });
    const tab = await listUsersPaged(admin, { size: 100, tab: "nomfa" });
    const tile = await listUsersPaged(admin, { size: 100, status: "ACTIVE", mfa: "off" });
    expect(tab.info.total).toBe(stats.noMfa);
    expect(tile.info.total).toBe(stats.noMfa);
    const report = (await runCustomReport(admin, "users", ["status", "mfa"])).rows;
    expect(report.filter((r) => r.status === "Active" && r.mfa === "Off").length).toBe(stats.noMfa);
  });

  it("search and other filters still apply on top of the tab; the tab never crosses tenants", async () => {
    const one = await listUsersPaged(admin, { q: `${TAG}_active_team`, size: 100, tab: "nomfa" });
    expect(one.rows.map((r) => r.name)).toEqual([name("active_team")]);
    const exec = await listUsersPaged(admin, { q: TAG, size: 100, tab: "nomfa", role: "Executive" });
    expect(exec.rows.map((r) => r.name)).toEqual([name("active_team")]);
    const bTab = await listUsersPaged(bAdmin, { q: TAG, size: 100, tab: "nomfa" });
    expect(bTab.rows.map((r) => r.name)).toEqual([name("tenantb_nomfa")]);
  });
});

describe("UX11 accessRequests dataset", () => {
  it("reads the system queue through the access-requests reads, with dates as Date", async () => {
    const rows = (await runCustomReport(admin, "accessRequests", ["name", "email", "company", "jobTitle", "status", "submittedAt", "reviewedAt"])).rows;
    const row = rows.find((r) => r.email === email("request"));
    expect(row).toMatchObject({ name: name("request"), company: `Company ${TAG}`, jobTitle: "Synthetic role", status: "New", reviewedAt: null });
    expect(row?.submittedAt).toBeInstanceOf(Date);
  });
});

describe("UX11 admin dataset gates", () => {
  it("offered/allowed only with the permission", () => {
    for (const fn of [allowedDatasetKeys, offeredDatasetKeys]) {
      expect(fn(admin)).toEqual(expect.arrayContaining(["users", "accessRequests"]));
      expect(fn(member)).not.toContain("users");
      expect(fn(member)).not.toContain("accessRequests");
      expect(fn(head)).toContain("users"); // admin:access
      expect(fn(head)).not.toContain("accessRequests"); // no iam:manage
    }
  });

  it("the engine refuses both datasets without the permission", async () => {
    for (const [ctx, dataset] of [
      [member, "users"],
      [member, "accessRequests"],
      [head, "accessRequests"],
    ] as const) {
      const err = await runCustomReport(ctx, dataset, []).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CustomReportError);
      expect((err as CustomReportError).code).toBe("FORBIDDEN");
    }
  });

  it("the PDF path refuses them without the permission", async () => {
    for (const [ctx, dataset] of [
      [member, "users"],
      [head, "accessRequests"],
    ] as const) {
      const err = await buildExport(ctx, { template: "table", dataset, columns: [] }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ExportError);
      expect((err as ExportError).code).toBe("FORBIDDEN");
    }
  });

  it("the API answers 403 without the permission and 200 with it", async () => {
    const call = async (ctx: TenantContext, qs: string) => {
      vi.mocked(getTenantContext).mockResolvedValueOnce(ctx);
      return GET(new Request(`http://localhost/api/reports/custom?${qs}`));
    };
    expect((await call(member, "dataset=users")).status).toBe(403);
    expect((await call(member, "dataset=accessRequests")).status).toBe(403);
    expect((await call(head, "dataset=accessRequests&format=csv")).status).toBe(403);

    const ok = await call(admin, "dataset=users&columns=name,email,mfa");
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { rows: ReportRow[] };
    expect(body.rows.some((r) => r.email === email("active_nomfa"))).toBe(true);
    expect(body.rows.some((r) => r.email === email("tenantb_nomfa"))).toBe(false);

    const csv = await call(admin, "dataset=accessRequests&format=csv");
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain(email("request"));
  });
});
