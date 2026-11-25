// @vitest-environment node
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// Plan Phase 1 — the upload routes: an oversized upload is refused before its body is read,
// the preview never echoes the file back, /apply answers 404 for an upload that isn't
// yours, and only people who update projects can change the tenant's stage vocabulary.
vi.mock("@/lib/tenant", async (orig) => ({ ...(await orig<typeof import("@/lib/tenant")>()), getTenantContext: vi.fn() }));
vi.mock("@/server/status-report-upload", async (orig) => {
  const actual = await orig<typeof import("@/server/status-report-upload")>();
  return {
    ...actual,
    previewStatusReport: vi.fn(async () => ({ uploadId: "u-1", format: "docx", rows: [], warnings: [] })),
    applyStatusReport: vi.fn(),
    saveStageTerm: vi.fn(async () => ({ term: "build ongoing", gateName: "Prototype" })),
  };
});

import { getTenantContext } from "@/lib/tenant";
import { applyStatusReport, previewStatusReport, saveStageTerm, UploadNotFoundError } from "@/server/status-report-upload";
import { POST as preview } from "@/app/api/reports/status-upload/route";
import { POST as apply } from "@/app/api/reports/status-upload/apply/route";
import { POST as stageTerms } from "@/app/api/reports/status-upload/stage-terms/route";

const pm = { tenantId: "t1", userId: "pm1", roles: ["ProjectManager"], permissions: ["project:read", "project:update"] };
const member = { tenantId: "t1", userId: "m1", roles: ["Member"], permissions: ["project:read"] };
const asUser = (ctx: unknown) => (getTenantContext as unknown as Mock).mockResolvedValue(ctx);

const upload = (bytes: number, headers: Record<string, string> = {}) => {
  const form = new FormData();
  form.append("file", new File([Buffer.alloc(bytes, 1)], "status.docx"));
  return new Request("http://localhost/api/reports/status-upload", { method: "POST", body: form, headers });
};

beforeEach(() => {
  vi.clearAllMocks();
  asUser(pm);
});

describe("status-upload preview route", () => {
  it("answers 413 on a declared oversized body without parsing anything", async () => {
    const res = await preview(upload(10, { "content-length": String(50 * 1024 * 1024) }));
    expect(res.status).toBe(413);
    expect(previewStatusReport).not.toHaveBeenCalled();
  });

  it("answers 413 while streaming a body over the cap", async () => {
    const res = await preview(upload(6 * 1024 * 1024));
    expect(res.status).toBe(413);
    expect(previewStatusReport).not.toHaveBeenCalled();
  });

  it("returns the upload id and never the file's bytes", async () => {
    const res = await preview(upload(100));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ uploadId: "u-1", fileName: "status.docx" });
    expect(body.data).not.toHaveProperty("base64");
  });
});

describe("status-upload apply route", () => {
  it("answers 404 for an upload that isn't the caller's", async () => {
    (applyStatusReport as unknown as Mock).mockRejectedValue(new UploadNotFoundError());
    const res = await apply(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ uploadId: "00000000-0000-4000-8000-000000000000", rows: [{ projectId: "00000000-0000-4000-8000-000000000001", narrative: "x" }] }) }));
    expect(res.status).toBe(404);
  });

  it("refuses the old client-supplied file field", async () => {
    (applyStatusReport as unknown as Mock).mockResolvedValue([]);
    const res = await apply(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ rows: [{ projectId: "00000000-0000-4000-8000-000000000001" }], file: { name: "a.pdf", format: "pdf", base64: "AAAA" } }) }));
    // The field is stripped by the schema: nothing the browser sends can become an attachment.
    expect(res.status).toBe(200);
    expect((applyStatusReport as unknown as Mock).mock.calls[0]![1]).not.toHaveProperty("file");
  });
});

describe("stage-terms route", () => {
  const teach = () => stageTerms(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ term: "Build ongoing", gateName: "Prototype" }) }));

  it("lets a PM teach a phrase", async () => {
    expect((await teach()).status).toBe(200);
    expect(saveStageTerm).toHaveBeenCalled();
  });

  it("refuses a member", async () => {
    asUser(member);
    expect((await teach()).status).toBe(403);
    expect(saveStageTerm).not.toHaveBeenCalled();
  });
});
