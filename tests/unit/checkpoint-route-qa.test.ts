import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// UX9 (D10) — the checkpoint route limits Head of QA to testing gates.
vi.mock("@/lib/tenant", async (orig) => ({ ...(await orig<typeof import("@/lib/tenant")>()), getTenantContext: vi.fn() }));
vi.mock("@/lib/access", () => ({ canWriteProject: vi.fn() }));
vi.mock("@/server/checkpoints", async (orig) => {
  const actual = await orig<typeof import("@/server/checkpoints")>();
  return {
    ...actual,
    checkpointIsTesting: vi.fn(),
    setCheckpointState: vi.fn(async () => ({ ok: true })),
    setProjectTemplate: vi.fn(async () => ({ ok: true })),
  };
});

import { getTenantContext } from "@/lib/tenant";
import { canWriteProject } from "@/lib/access";
import { checkpointIsTesting, setCheckpointState, setProjectTemplate } from "@/server/checkpoints";
import { PATCH } from "@/app/api/projects/[id]/checkpoints/route";

const qa = { tenantId: "t1", userId: "qa1", roles: ["HeadOfQA"], permissions: ["project:read", "project:stage"] };
const params = { params: Promise.resolve({ id: "p1" }) };
const patch = (body: unknown) => PATCH(new Request("http://localhost/api/projects/p1/checkpoints", { method: "PATCH", body: JSON.stringify(body) }), params);

beforeEach(() => {
  vi.clearAllMocks();
  (getTenantContext as unknown as Mock).mockResolvedValue(qa);
  (canWriteProject as unknown as Mock).mockResolvedValue(false);
});

describe("checkpoint PATCH for Head of QA (UX9)", () => {
  it("allows a testing gate", async () => {
    (checkpointIsTesting as unknown as Mock).mockResolvedValue(true);
    const res = await patch({ checkpointId: "c-sit", state: "InProgress" });
    expect(res.status).toBe(200);
    expect(setCheckpointState).toHaveBeenCalled();
  });

  it("refuses any other gate, and swapping the template", async () => {
    (checkpointIsTesting as unknown as Mock).mockResolvedValue(false);
    const res = await patch({ checkpointId: "c-brd", state: "Done" });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "TESTING_GATES_ONLY" } });
    expect((await patch({ templateId: "tpl" })).status).toBe(403);
    expect(setCheckpointState).not.toHaveBeenCalled();
    expect(setProjectTemplate).not.toHaveBeenCalled();
  });

  it("doesn't limit a Head of QA on a project they run", async () => {
    (canWriteProject as unknown as Mock).mockResolvedValue(true);
    expect((await patch({ checkpointId: "c-brd", state: "Done" })).status).toBe(200);
    expect(checkpointIsTesting).not.toHaveBeenCalled();
  });
});
