// Phase 4 connectors — token encryption at rest, GitHub summariser, connect/disconnect,
// and safe defaults. No live network is exercised.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { encryptSecret, decryptSecret } from "@/lib/secret-box";
import { summarizeGithub } from "@/server/connectors/github";
import { getIntegrationSummary } from "@/server/connectors";
import { setIntegration, listIntegrations } from "@/server/integrations";
import { createProject } from "@/server/projects";

describe("Workspace — connectors (phase 4)", () => {
  let kcb: TenantContext;
  let projectId: string;
  const projectIds: string[] = [];

  beforeAll(async () => {
    // Ensure an encryption key exists for the round-trip regardless of local env.
    if (!process.env.INTEGRATION_ENCRYPTION_KEY && !process.env.MFA_ENCRYPTION_KEY) {
      process.env.INTEGRATION_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    }
    const k = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!k) throw new Error("Seed required.");
    const kUser = await withTenant({ tenantId: k.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    kcb = { tenantId: k.id, userId: kUser.id, roles: [] };
    const project = await createProject(kcb, {
      code: `CN-${Date.now().toString().slice(-6)}`,
      name: "Connector test",
      type: "Project",
      priority: "Medium",
      status: "Planning",
    });
    projectId = project.id;
    projectIds.push(project.id);
  });

  afterAll(async () => {
    await withTenant({ tenantId: kcb.tenantId, userId: "seed" }, async (tx) => {
      await tx.projectIntegration.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    });
    await prisma.$disconnect();
  });

  it("encrypts and decrypts a secret round-trip", () => {
    const token = "ghp_" + crypto.randomBytes(12).toString("hex");
    const enc = encryptSecret(token);
    expect(enc).not.toContain(token); // not plaintext
    expect(decryptSecret(enc)).toBe(token);
  });

  it("summarises GitHub payloads (last commit, PRs, fixed vs open, PRs excluded from issues)", () => {
    const s = summarizeGithub(
      "acme/repo",
      [{ commit: { message: "Fix reconciliation bug\n\nlong body", author: { name: "Jane", date: new Date().toISOString() } } }],
      [{}, {}, {}], // 3 open PRs
      [{}, {}, { pull_request: {} }], // 2 real open issues (+1 PR excluded)
      [{}, { pull_request: {} }], // 1 real closed issue (fixed)
    );
    expect(s.headline).toContain("acme/repo · 3 open PRs");
    expect(s.lines[0]).toContain("Fix reconciliation bug");
    expect(s.lines[0]).toContain("Jane");
    expect(s.lines[2]).toContain("2 open");
    expect(s.lines[2]).toContain("1 closed");
  });

  it("stores the token encrypted and reports connect state", async () => {
    await setIntegration(kcb, projectId, "github", { connected: true, resource: "acme/repo", token: "ghp_secret_123" });
    const row = await withTenant(kcb, (tx) =>
      tx.projectIntegration.findUnique({ where: { projectId_provider: { projectId, provider: "github" } } }),
    );
    expect(row?.secret).toBeTruthy();
    expect(row?.secret).not.toBe("ghp_secret_123"); // encrypted at rest
    expect(decryptSecret(row!.secret!)).toBe("ghp_secret_123");

    const cards = await listIntegrations(kcb, projectId);
    const gh = cards.find((c) => c.provider === "github")!;
    expect(gh.connected).toBe(true);
    expect(gh.hasToken).toBe(true);
    expect(gh.live).toBe(true);
    // The token is never exposed on the card.
    expect(JSON.stringify(gh)).not.toContain("ghp_secret_123");
  });

  it("clears the token on disconnect", async () => {
    await setIntegration(kcb, projectId, "github", { connected: false });
    const row = await withTenant(kcb, (tx) =>
      tx.projectIntegration.findUnique({ where: { projectId_provider: { projectId, provider: "github" } } }),
    );
    expect(row?.connected).toBe(false);
    expect(row?.secret).toBeNull();
  });

  it("returns null summaries for unconnected or unsupported providers (no network)", async () => {
    expect(await getIntegrationSummary(kcb, projectId, "github")).toBeNull(); // disconnected
    await setIntegration(kcb, projectId, "sentry", { connected: true, resource: "acme/app", token: "x" });
    expect(await getIntegrationSummary(kcb, projectId, "sentry")).toBeNull(); // no connector yet
  });
});
