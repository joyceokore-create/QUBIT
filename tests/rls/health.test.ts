// M-P0a (docs/36 §4) — the health probe. What matters is that it actually touches the
// database (so a dead DB fails the deploy) and that it leaks nothing to an unauthenticated
// caller.
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("M-P0a /api/health", () => {
  it("reports ok with a real database behind it", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; db: string; latencyMs: number };
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
    expect(typeof body.latencyMs).toBe("number");
  });

  it("is never cached — a stale 200 would hide an outage", async () => {
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("says nothing an unauthenticated caller shouldn't see", async () => {
    const res = await GET();
    const text = JSON.stringify(await res.json());
    // No connection strings, credentials, versions, hostnames or row counts.
    for (const leak of ["postgres://", "postgresql://", "password", "@", "prisma", "tenant"]) {
      expect(text.toLowerCase()).not.toContain(leak);
    }
    // The whole payload stays tiny — three keys, nothing incidental.
    expect(Object.keys(JSON.parse(text))).toEqual(["status", "db", "latencyMs"]);
  });
});
