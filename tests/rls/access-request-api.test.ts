// Exercises the unauthenticated public route against the real DB (node env).
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/access-request/route";
import { prisma } from "@/lib/db";

const EMAIL = "route-test@example.invalid";

function post(body: unknown, ip = "1.2.3.4") {
  return POST(
    new Request("http://localhost/api/access-request", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/access-request", () => {
  afterEach(async () => {
    await prisma.accessRequest.deleteMany({ where: { email: EMAIL } });
  });

  it("stores a valid request and returns ok", async () => {
    const res = await post({ fullName: "Ada K.", email: EMAIL, company: "Acme", jobTitle: "PMO" });
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ ok: true });
    const row = await prisma.accessRequest.findFirst({ where: { email: EMAIL } });
    expect(row?.company).toBe("Acme");
  });

  it("silently drops a honeypot submission without storing", async () => {
    const res = await post({ fullName: "Bot", email: EMAIL, company: "Acme", companyUrl: "http://bot" }, "5.6.7.8");
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ ok: true });
    const row = await prisma.accessRequest.findFirst({ where: { email: EMAIL } });
    expect(row).toBeNull();
  });

  it("rejects an invalid payload with 400", async () => {
    const res = await post({ fullName: "", email: "nope", company: "" }, "9.9.9.9");
    expect(res.status).toBe(400);
  });
});
