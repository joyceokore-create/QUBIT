import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/api-guard", () => ({
  requirePermission: vi.fn(),
}));
vi.mock("@/server/access-requests", () => ({
  reviewAccessRequest: vi.fn(),
  countNewAccessRequests: vi.fn(),
  AccessRequestError: class extends Error {
    code: string;
    constructor(code: string, m: string) { super(m); this.code = code; }
  },
}));

import { requirePermission } from "@/lib/api-guard";
import { reviewAccessRequest, countNewAccessRequests } from "@/server/access-requests";
import { PATCH } from "@/app/api/admin/access-requests/[id]/route";
import { GET } from "@/app/api/admin/access-requests/count/route";

const okCtx = { ctx: { tenantId: "t1", userId: "u1", roles: ["PlatformSuperAdmin"] } };
const params = { params: Promise.resolve({ id: "req_1" }) };

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/admin/access-requests/req_1", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    params,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("admin access-request routes", () => {
  it("PATCH forwards the guard's 403 when not permitted", async () => {
    const denied = { response: new Response(null, { status: 403 }) };
    (requirePermission as unknown as Mock).mockResolvedValue(denied);
    const res = await patch({ status: "REVIEWED" });
    expect(res.status).toBe(403);
    expect(reviewAccessRequest).not.toHaveBeenCalled();
  });

  it("PATCH reviews the request when permitted", async () => {
    (requirePermission as unknown as Mock).mockResolvedValue(okCtx);
    (reviewAccessRequest as unknown as Mock).mockResolvedValue({ id: "req_1", status: "REVIEWED" });
    const res = await patch({ status: "REVIEWED" });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(reviewAccessRequest).toHaveBeenCalledWith(okCtx.ctx, "req_1", "REVIEWED");
  });

  it("PATCH rejects an invalid status with 400", async () => {
    (requirePermission as unknown as Mock).mockResolvedValue(okCtx);
    const res = await patch({ status: "BOGUS" });
    expect(res.status).toBe(400);
  });

  it("GET count returns the pending count", async () => {
    (requirePermission as unknown as Mock).mockResolvedValue(okCtx);
    (countNewAccessRequests as unknown as Mock).mockResolvedValue(3);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ new: 3 });
  });
});
