// Exercises the unauthenticated public route against the real DB (node env).
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/access-request/route";
import { prisma } from "@/lib/db";

const EMAIL = "route-test@example.invalid";
const RATE_LIMIT_EMAIL = "rl-429@example.invalid";
const RATE_LIMIT_IP = "203.0.113.77";

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
    await prisma.accessRequest.deleteMany({ where: { email: { in: [EMAIL, RATE_LIMIT_EMAIL] } } });
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

  it("rate-limits after 5 valid submissions from the same IP, counting every accepted request", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await post(
        { fullName: "Rate Limited", email: RATE_LIMIT_EMAIL, company: "Acme", jobTitle: "PMO" },
        RATE_LIMIT_IP,
      );
      expect(res.status).toBe(201);
    }

    const sixth = await post(
      { fullName: "Rate Limited", email: RATE_LIMIT_EMAIL, company: "Acme", jobTitle: "PMO" },
      RATE_LIMIT_IP,
    );
    expect(sixth.status).toBe(429);
  });
});
