// access_request is a SYSTEM table (no tenant_id): a requester belongs to no tenant yet.
// It must be creatable + readable via the bare prisma client, outside any withTenant() scope.
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const TEST_EMAIL = "req-smoke@example.invalid";

describe("AccessRequest system table", () => {
  afterAll(async () => {
    await prisma.accessRequest.deleteMany({ where: { email: TEST_EMAIL } });
  });

  it("creates and reads a row via the bare client (no tenant context)", async () => {
    const created = await prisma.accessRequest.create({
      data: { fullName: "Test User", email: TEST_EMAIL, company: "Test Co", jobTitle: "Head of PMO" },
    });
    expect(created.id).toBeTruthy();
    expect(created.status).toBe("NEW");

    const found = await prisma.accessRequest.findFirst({ where: { email: TEST_EMAIL } });
    expect(found?.company).toBe("Test Co");
  });
});
