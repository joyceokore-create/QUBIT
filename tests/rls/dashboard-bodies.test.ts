// Phase 3 — per-role dashboard bodies. Smoke-tests that each body's data fetch runs against
// the real schema without throwing (server components are async fns; awaiting one runs its
// queries and returns an element). Requires a seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant";
import { ExecutiveBody, QaBody, PmBody, AdminBody } from "@/components/dashboard/bodies";

describe("dashboard bodies — data-fetch smoke (Phase 3)", () => {
  let ctx: TenantContext;

  beforeAll(async () => {
    const rb = await prisma.tenant.findUnique({ where: { slug: "riverbank" } });
    if (!rb) throw new Error("dashboard-body tests require seeded data — run `pnpm prisma:seed` first.");
    ctx = { tenantId: rb.id, userId: "smoke-viewer", roles: ["PlatformSuperAdmin"] };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("Executive body fetches without throwing", async () => {
    await expect(ExecutiveBody({ ctx })).resolves.toBeTruthy();
  });
  it("HeadOfQA body fetches without throwing", async () => {
    await expect(QaBody({ ctx })).resolves.toBeTruthy();
  });
  it("ProjectManager body fetches without throwing", async () => {
    await expect(PmBody({ ctx })).resolves.toBeTruthy();
  });
  it("PlatformSuperAdmin body fetches without throwing", async () => {
    await expect(AdminBody({ ctx })).resolves.toBeTruthy();
  });
});
