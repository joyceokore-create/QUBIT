// @vitest-environment node
// Plan Phase 3 — reading a status document with Lumi AI: the answer parser, QUBIT's own
// validation of Lumi's lines, and the connector's run polling (stubbed fetch — no network).
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonFromAnswer, LumiExtractError, rowsFromLumi } from "@/server/status-report/lumi-extract";
import { clearLumiTokenCache, createLumiRun, LumiError, uploadLumiFile, type LumiConnection } from "@/server/connectors/lumi";
import { NARRATIVE_MAX } from "@/server/status-report/parse";

const conn: LumiConnection = { baseUrl: "https://lumi.example.invalid/api/v1", clientId: "cred_test", clientSecret: "s3cret", source: "env" };
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  clearLumiTokenCache();
});

describe("jsonFromAnswer", () => {
  it("reads plain JSON, a fenced block, or JSON inside a sentence", () => {
    expect(jsonFromAnswer('{"projects":[]}')).toEqual({ projects: [] });
    expect(jsonFromAnswer('```json\n{"projects":[1]}\n```')).toEqual({ projects: [1] });
    expect(jsonFromAnswer('Here you go: {"projects":[2]} — done.')).toEqual({ projects: [2] });
  });
  it("refuses an answer with no JSON", () => {
    expect(() => jsonFromAnswer("I could not read the file.")).toThrow(LumiExtractError);
    expect(() => jsonFromAnswer("{not json}")).toThrow(LumiExtractError);
  });
});

describe("rowsFromLumi", () => {
  it("maps Lumi's lines onto the review's rows", () => {
    const { rows, warnings } = rowsFromLumi({
      projects: [
        { project: "  Payments   Revamp ", code: "PAY-01", market: null, rag: "Amber", stage: "UAT", update: "UAT slipped a week.", percent: "60%", risks: ["Test env down"], next_steps: ["Re-run UAT", ""] },
        { project: "Data Lake", rag: null, stage: null, update: null },
      ],
    });
    expect(warnings).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ line: 1, project: "Payments Revamp", code: "PAY-01", market: null, status: "Amber", statusRaw: "Amber", stage: "UAT", update: "UAT slipped a week.", percent: 60, gates: [], cells: [] });
    expect(rows[0]!.sections).toEqual([
      { title: "Risks & issues", lines: ["Test env down"] },
      { title: "Next steps", lines: ["Re-run UAT"] },
    ]);
    expect(rows[1]).toMatchObject({ line: 2, project: "Data Lake", code: null, status: null, stage: "", update: "", percent: null, sections: [] });
  });

  it("drops a line with no project, flags an odd status, caps long text", () => {
    const { rows, warnings } = rowsFromLumi({
      projects: [{ project: "" }, { code: "X-1" }, { project: "Branch Onboarding", rag: "Purple", update: "x".repeat(NARRATIVE_MAX + 50), percent: 140 }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.line).toBe(1);
    expect(rows[0]!.status).toBeNull();
    expect(rows[0]!.update).toHaveLength(NARRATIVE_MAX);
    expect(rows[0]!.percent).toBeNull();
    expect(rows[0]!.warnings.join(" ")).toMatch(/Purple.*isn't Green, Amber or Red/);
    expect(rows[0]!.warnings.join(" ")).toMatch(/cut to/);
    expect(warnings).toHaveLength(2);
  });

  it("refuses an answer without a projects list", () => {
    expect(() => rowsFromLumi({ lines: [] })).toThrow(LumiExtractError);
    expect(() => rowsFromLumi(null)).toThrow(LumiExtractError);
  });
});

describe("Lumi connector — general tasks", () => {
  it("uploads a file as multipart with an Idempotency-Key", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/oauth/token")) return ok({ access_token: "tok", expires_in: 900 });
      return ok({ file_id: "file_1", status: "processing" }, 201);
    });
    const f = await uploadLumiFile(conn, Buffer.from("hello"), "note.pdf", "application/pdf");
    expect(f.file_id).toBe("file_1");
    const up = calls.find((c) => c.url.endsWith("/files"))!;
    expect(up.init.body).toBeInstanceOf(FormData);
    const headers = up.init.headers as Record<string, string>;
    expect(headers["idempotency-key"]).toBeTruthy();
    expect(headers["content-type"]).toBeUndefined();
    const file = (up.init.body as FormData).get("file") as File;
    expect(file.name).toBe("note.pdf");
    expect(file.type).toBe("application/pdf");
  });

  it("polls a run Lumi answered 202 for until it settles", async () => {
    let polls = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url.endsWith("/oauth/token")) return ok({ access_token: "tok", expires_in: 900 });
      if (url.endsWith("/runs") && init.method === "POST") {
        expect(JSON.parse(String(init.body)).mode).toBe("wait");
        return ok({ run_id: "run_1", conversation_id: "conv_1", status: "running", output: { text: "", data: null } }, 202);
      }
      polls++;
      return ok({ run_id: "run_1", conversation_id: "conv_1", status: polls < 2 ? "running" : "done", output: { text: "{}", data: null } });
    });
    const run = await createLumiRun(conn, { message: "read it" }, { pollMs: 1 });
    expect(run.status).toBe("done");
    expect(polls).toBe(2);
  });

  it("stops polling at any status that isn't queued or running (a pause such as needs_context)", async () => {
    let polls = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url.endsWith("/oauth/token")) return ok({ access_token: "tok", expires_in: 900 });
      if (init.method === "POST") return ok({ run_id: "run_1", conversation_id: "conv_1", status: "running", output: { text: "", data: null } }, 202);
      polls++;
      return ok({ run_id: "run_1", conversation_id: "conv_1", status: "needs_context", pending: { type: "question", text: "The file is a scan." }, output: { text: "", data: null } });
    });
    const run = await createLumiRun(conn, { message: "read it" }, { pollMs: 1 });
    expect(run.status).toBe("needs_context");
    expect(run.pending?.text).toBe("The file is a scan.");
    expect(polls).toBe(1);
  });

  it("gives up on a run that outlives the deadline", async () => {
    let t = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("/oauth/token")) return ok({ access_token: "tok", expires_in: 900 });
      return ok({ run_id: "run_1", conversation_id: "conv_1", status: "running", output: { text: "", data: null } }, 202);
    });
    const err = await createLumiRun(conn, { message: "read it" }, { pollMs: 1, deadlineMs: 10, now: () => (t += 6) }).catch((e) => e);
    expect(err).toBeInstanceOf(LumiError);
    expect((err as LumiError).code).toBe("run_timeout");
  });
});
