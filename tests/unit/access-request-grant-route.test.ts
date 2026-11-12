import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// UX11 — POST /api/admin/access-requests/:id/grant: permission gates and error mapping.
vi.mock("@/lib/api-guard", () => ({
  requirePermission: vi.fn(),
  forbidden: () => new Response(null, { status: 403 }),
}));
vi.mock("@/server/access-requests", async () => {
  const { z } = await import("zod");
  return {
    grantAccessRequest: vi.fn(),
    GrantAccessInput: z.object({ role: z.string().min(1), departmentId: z.string().uuid().nullable().optional(), teamId: z.string().uuid().nullable().optional() }),
    AccessRequestError: class extends Error {
      code: string;
      constructor(code: string, m: string) {
        super(m);
        this.code = code;
      }
    },
  };
});
vi.mock("@/server/users", () => ({
  UserAdminError: class extends Error {
    code: string;
    constructor(m: string, code: string) {
      super(m);
      this.code = code;
    }
  },
}));

import { requirePermission } from "@/lib/api-guard";
import { AccessRequestError, grantAccessRequest } from "@/server/access-requests";
import { UserAdminError } from "@/server/users";
import { POST } from "@/app/api/admin/access-requests/[id]/grant/route";

const sa = { ctx: { tenantId: "t1", userId: "u1", roles: ["PlatformSuperAdmin"] } };
const params = { params: Promise.resolve({ id: "req_1" }) };
const post = (body: unknown) => POST(new Request("http://localhost/api/admin/access-requests/req_1/grant", { method: "POST", body: JSON.stringify(body) }), params);

beforeEach(() => vi.clearAllMocks());

describe("grant access route", () => {
  it("forwards the guard's 403 without iam:manage", async () => {
    (requirePermission as unknown as Mock).mockResolvedValue({ response: new Response(null, { status: 403 }) });
    expect((await post({ role: "Member" })).status).toBe(403);
    expect(grantAccessRequest).not.toHaveBeenCalled();
  });

  it("refuses a caller who may manage IAM but not invite users", async () => {
    (requirePermission as unknown as Mock).mockResolvedValue({ ctx: { tenantId: "t1", userId: "u1", roles: [], permissions: ["iam:manage"] } });
    expect((await post({ role: "Member" })).status).toBe(403);
    expect(grantAccessRequest).not.toHaveBeenCalled();
  });

  it("validates the body", async () => {
    (requirePermission as unknown as Mock).mockResolvedValue(sa);
    expect((await post({ role: "" })).status).toBe(400);
    expect((await post({ role: "Member", teamId: "not-a-uuid" })).status).toBe(400);
    expect(grantAccessRequest).not.toHaveBeenCalled();
  });

  it("creates and returns the create-user shape", async () => {
    (requirePermission as unknown as Mock).mockResolvedValue(sa);
    (grantAccessRequest as unknown as Mock).mockResolvedValue({ created: { user: { id: "new1" }, emailed: false, sso: false, acceptUrl: "http://localhost/accept/x" } });
    const res = await post({ role: "Member" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "new1", emailed: false, acceptUrl: "http://localhost/accept/x" });
    expect(grantAccessRequest).toHaveBeenCalledWith(sa.ctx, "req_1", { role: "Member" });
  });

  it("maps engine errors: email taken 400, already reviewed 409, unknown 404", async () => {
    (requirePermission as unknown as Mock).mockResolvedValue(sa);
    (grantAccessRequest as unknown as Mock).mockRejectedValueOnce(new UserAdminError("A user with this email already exists.", "EMAIL_TAKEN"));
    const taken = await post({ role: "Member" });
    expect(taken.status).toBe(400);
    expect((await taken.json()).error.code).toBe("EMAIL_TAKEN");
    (grantAccessRequest as unknown as Mock).mockRejectedValueOnce(new AccessRequestError("ALREADY_REVIEWED", "x"));
    expect((await post({ role: "Member" })).status).toBe(409);
    (grantAccessRequest as unknown as Mock).mockRejectedValueOnce(new AccessRequestError("NOT_FOUND", "x"));
    expect((await post({ role: "Member" })).status).toBe(404);
  });
});
