import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// UX7 — milestone writes need the per-project PM check, not just the coarse role key.
vi.mock("@/lib/api-guard", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requirePermission: vi.fn(),
    forbidden: (message: string) => NextResponse.json({ error: { code: "FORBIDDEN", message } }, { status: 403 }),
  };
});
vi.mock("@/lib/access", () => ({ canWriteProject: vi.fn() }));
vi.mock("@/server/preferences", () => ({ getTenantTimeZone: vi.fn(async () => "Africa/Nairobi") }));
vi.mock("@/server/milestones", async (orig) => {
  const actual = await orig<typeof import("@/server/milestones")>();
  return {
    ...actual,
    milestoneProjectId: vi.fn(),
    updateMilestone: vi.fn(),
    deleteMilestone: vi.fn(),
    rescheduleMilestone: vi.fn(async () => ({ id: "m1", dueDate: new Date() })),
  };
});

import { requirePermission } from "@/lib/api-guard";
import { canWriteProject } from "@/lib/access";
import { deleteMilestone, milestoneProjectId, rescheduleMilestone, updateMilestone } from "@/server/milestones";
import { DELETE, PATCH } from "@/app/api/milestones/[id]/route";
import { POST } from "@/app/api/milestones/[id]/reschedule/route";

const ctx = { ctx: { tenantId: "t1", userId: "pm_other", roles: ["ProjectManager"] } };
const params = { params: Promise.resolve({ id: "m1" }) };
const req = (method: string, body?: unknown) => new Request("http://localhost/api/milestones/m1", { method, body: body ? JSON.stringify(body) : undefined });

beforeEach(() => {
  vi.clearAllMocks();
  (requirePermission as unknown as Mock).mockResolvedValue(ctx);
  (milestoneProjectId as unknown as Mock).mockResolvedValue("p1");
});

describe("milestone routes (UX7)", () => {
  it("refuses a PM who doesn't run the milestone's project — edit, delete and reschedule", async () => {
    (canWriteProject as unknown as Mock).mockResolvedValue(false);
    expect((await PATCH(req("PATCH", { name: "x" }), params)).status).toBe(403);
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
    expect((await POST(req("POST", { newDate: "2030-01-10", reason: "Other", goLiveEffect: "No change" }), params)).status).toBe(403);
    expect(updateMilestone).not.toHaveBeenCalled();
    expect(deleteMilestone).not.toHaveBeenCalled();
    expect(rescheduleMilestone).not.toHaveBeenCalled();
    expect(canWriteProject).toHaveBeenCalledWith(ctx.ctx, "p1");
  });

  it("404s an unknown milestone before any write", async () => {
    (milestoneProjectId as unknown as Mock).mockResolvedValue(null);
    expect((await PATCH(req("PATCH", { name: "x" }), params)).status).toBe(404);
  });

  it("lets the project's PM reschedule, storing the end of the chosen Nairobi day", async () => {
    (canWriteProject as unknown as Mock).mockResolvedValue(true);
    const res = await POST(req("POST", { newDate: "2030-01-10", reason: "Scope changed", goLiveEffect: "Moves", note: "n" }), params);
    expect(res.status).toBe(200);
    const [, id, input] = (rescheduleMilestone as unknown as Mock).mock.calls[0];
    expect(id).toBe("m1");
    // 10 Jan in Nairobi (UTC+3) ends at 2030-01-10T20:59:59.999Z.
    expect((input.dueAt as Date).toISOString()).toBe("2030-01-10T20:59:59.999Z");
    expect(input).toMatchObject({ reason: "Scope changed", goLiveEffect: "Moves", note: "n" });
  });

  it("rejects a bad reason or an impossible date", async () => {
    (canWriteProject as unknown as Mock).mockResolvedValue(true);
    expect((await POST(req("POST", { newDate: "2030-02-30", reason: "Other", goLiveEffect: "No change" }), params)).status).toBe(400);
    expect((await POST(req("POST", { newDate: "2030-01-10", reason: "Because", goLiveEffect: "No change" }), params)).status).toBe(400);
    expect(rescheduleMilestone).not.toHaveBeenCalled();
  });
});
