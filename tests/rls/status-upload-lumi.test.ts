// @vitest-environment node
// Plan Phase 3 — a status document the rules can't read (prose, a scan) is read by Lumi AI.
// Lumi is stubbed at fetch (no network). The rules run first; Lumi steps in when they find
// nothing or the PM asks; Lumi's lines are matched and reviewed like any other, the upload
// records who read it and Lumi's run, metrics are logged without content, the Lumi
// conversation is deleted, a Lumi failure falls back to the rules, and nothing crosses a tenant.
import { deflateRawSync } from "node:zlib";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { clearLumiTokenCache } from "@/server/connectors/lumi";
import { previewStatusReport } from "@/server/status-report-upload";
import { EXTRACT_PURPOSE } from "@/server/status-report/lumi-extract";
import { createUsers, cleanupFixtureUsers } from "./_users";

const NOW = new Date("2026-10-07T10:00:00Z");

/** A Word file whose body is the given XML (paragraphs or a table). */
function docx(body: string): Buffer {
  const raw = Buffer.from(`<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`, "utf8");
  const data = deflateRawSync(raw);
  const name = Buffer.from("word/document.xml");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(data.length, 20);
  cen.writeUInt32LE(raw.length, 24);
  cen.writeUInt16LE(name.length, 28);
  const cenBuf = Buffer.concat([cen, name]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cenBuf.length, 12);
  eocd.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, cenBuf, eocd]);
}
const para = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const cell = (t: string) => `<w:tc>${para(t)}</w:tc>`;
const tr = (cells: string[]) => `<w:tr>${cells.map(cell).join("")}</w:tr>`;

const PROSE = docx(para("Weekly note.") + para("Lumi Alpha is amber: UAT slipped a week.") + para("Lumi Foreign is green."));
const TABLE = docx(`<w:tbl>${tr(["Project", "Status", "Update and Outlook"])}${tr(["Lumi Alpha", "Green", "From the table."])}</w:tbl>`);

/** Lumi's answer: one line for the PM's project, one for another tenant's, one with no name. */
const ANSWER = JSON.stringify({
  projects: [
    { project: "Lumi Alpha", code: null, market: null, rag: "Amber", stage: "UAT", update: "UAT slipped a week.", percent: null, risks: [], next_steps: [] },
    { project: "Lumi Foreign", rag: "Green", update: "Another tenant's project." },
    { project: "" },
  ],
});

interface Seen {
  paths: string[];
  deleted: string[];
  files: number;
}

/** A stub Lumi. `run` shapes the run answer; every call is recorded (never its secrets). */
function stubLumi(run: Record<string, unknown> = { status: "done", output: { text: ANSWER, data: null } }): Seen {
  const seen: Seen = { paths: [], deleted: [], files: 0 };
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, "");
    seen.paths.push(`${init?.method ?? "GET"} ${path}`);
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (path === "/oauth/token") return reply({ access_token: "tok", expires_in: 900 });
    if (path === "/files") {
      seen.files++;
      return reply({ file_id: "file_1", status: "ready" }, 201);
    }
    if (path === "/runs") return reply({ run_id: "run_test_1", conversation_id: "conv_test_1", model: "test-model", usage: { input_tokens: 120, output_tokens: 40 }, ...run });
    if (init?.method === "DELETE") {
      seen.deleted.push(path);
      return new Response(null, { status: 204 });
    }
    return reply({ error: "not_found", message: "no" }, 404);
  });
  return seen;
}

describe("status-report upload — read by Lumi AI", () => {
  let rbId: string;
  let dbId: string;
  let pm: TenantContext;
  let alpha: string;
  let foreign: string;
  const users: string[] = [];

  beforeAll(async () => {
    const [rb, db] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [a] = await createUsers(rbId, 1, "lmx");
    users.push(a.id);
    pm = { tenantId: rbId, userId: a.id, roles: ["ProjectManager"] };
    const mk = (tenantId: string, code: string, name: string, lead: string | null) =>
      withTenant({ tenantId, userId: "seed" }, (tx) => tx.project.create({ data: { tenantId, code, name, type: "Project", priority: "Med", status: "OnTrack", leadUserId: lead }, select: { id: true } })).then((x) => x.id);
    alpha = await mk(rbId, "LMX-A", "Lumi Alpha", pm.userId);
    foreign = await mk(dbId, "LMX-X", "Lumi Foreign", null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    clearLumiTokenCache();
  });

  afterAll(async () => {
    await withTenant({ tenantId: rbId, userId: "seed" }, async (tx) => {
      await tx.statusUpload.deleteMany({ where: { uploadedById: { in: users } } });
      await tx.aiCallLog.deleteMany({ where: { userId: { in: users } } });
      await tx.auditLog.deleteMany({ where: { actorId: { in: users } } });
      await tx.project.deleteMany({ where: { id: alpha } });
    });
    await withTenant({ tenantId: dbId, userId: "seed" }, (tx) => tx.project.deleteMany({ where: { id: foreign } }));
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  const connect = () => {
    vi.stubEnv("LUMI_BASE_URL", "https://lumi.example.invalid/api/v1");
    vi.stubEnv("LUMI_CLIENT_ID", "cred_test");
    vi.stubEnv("LUMI_CLIENT_SECRET", "not-a-real-secret");
    vi.stubEnv("LUMI_INLINE_SCHEMA", "");
  };
  const disconnect = () => {
    vi.stubEnv("LUMI_BASE_URL", "");
    vi.stubEnv("LUMI_CLIENT_ID", "");
    vi.stubEnv("LUMI_CLIENT_SECRET", "");
  };
  const uploadRow = (id: string) => withTenant(pm, (tx) => tx.statusUpload.findUniqueOrThrow({ where: { id }, select: { extractor: true, extractorRunId: true, rows: { select: { line: true, projectId: true, matchConfidence: true } } } }));

  it("prose with Lumi not connected: no lines, read by the rules, no Lumi call", async () => {
    disconnect();
    const seen = stubLumi();
    const p = await previewStatusReport(pm, PROSE, "note.docx", null, NOW);
    expect(p.extractor).toBe("rules");
    expect(p.rows).toHaveLength(0);
    expect(seen.paths).toEqual([]);
  });

  it("prose with Lumi connected: Lumi's lines are matched within the tenant and recorded", async () => {
    connect();
    const seen = stubLumi();
    const p = await previewStatusReport(pm, PROSE, "note.docx", null, NOW);
    expect(p.extractor).toBe("lumi");
    expect(p.warnings[0]).toMatch(/Read by Lumi AI/);
    expect(p.warnings.join(" ")).toMatch(/line 3 was left out/);
    expect(p.rows.map((r) => r.project)).toEqual(["Lumi Alpha", "Lumi Foreign"]);
    const a = p.rows.find((r) => r.project === "Lumi Alpha")!;
    expect(a.match).toMatchObject({ projectId: alpha, confidence: "exact" });
    expect(a.status).toBe("Amber");
    // Another tenant's project is never a match, nor offered for sending.
    const f = p.rows.find((r) => r.project === "Lumi Foreign")!;
    expect(f.match.projectId).not.toBe(foreign);
    expect(f.owner).toBeNull();
    expect(p.projects.some((x) => x.id === foreign)).toBe(false);

    expect(seen.files).toBe(1);
    expect(seen.paths).toContain("POST /runs");
    expect(seen.deleted).toEqual(["/conversations/conv_test_1"]);
    const up = await uploadRow(p.uploadId);
    expect(up.extractor).toBe("lumi");
    expect(up.extractorRunId).toBe("run_test_1");
    expect(up.rows.find((r) => r.projectId === alpha)?.matchConfidence).toBe("exact");
    const logs = await withTenant(pm, (tx) => tx.aiCallLog.findMany({ where: { userId: pm.userId, purpose: EXTRACT_PURPOSE } }));
    expect(logs.at(-1)).toMatchObject({ usedAi: true, model: "test-model", inputTokens: 120, outputTokens: 40 });
  });

  it("a table the rules read: Lumi is not asked unless the PM ticks it", async () => {
    connect();
    let seen = stubLumi();
    const auto = await previewStatusReport(pm, TABLE, "table.docx", null, NOW);
    expect(auto.extractor).toBe("rules");
    expect(auto.rows[0]!.update).toBe("From the table.");
    expect(seen.paths).toEqual([]);

    vi.unstubAllGlobals();
    seen = stubLumi();
    const forced = await previewStatusReport(pm, TABLE, "table.docx", null, NOW, "lumi");
    expect(forced.extractor).toBe("lumi");
    expect(forced.rows.find((r) => r.project === "Lumi Alpha")!.update).toBe("UAT slipped a week.");
    expect(seen.files).toBe(1);
    // Re-reading the same file for the same week replaces the preview, now marked as Lumi's.
    expect((await uploadRow(forced.uploadId)).extractor).toBe("lumi");
  });

  it("Lumi fails: the rules' reading stands with Lumi's reason, and the conversation is still deleted", async () => {
    connect();
    const seen = stubLumi({ status: "failed", output: { text: "", data: null }, error: { error: "quota_exceeded", message: "this run would exceed the tokens reserved for it" } });
    const p = await previewStatusReport(pm, TABLE, "table-2.docx", null, NOW, "lumi");
    expect(p.extractor).toBe("rules");
    expect(p.rows[0]!.update).toBe("From the table.");
    expect(p.warnings.join(" ")).toMatch(/Lumi: Lumi's token allowance/);
    expect(seen.deleted).toEqual(["/conversations/conv_test_1"]);
    expect((await uploadRow(p.uploadId)).extractor).toBe("rules");
  });

  it("Lumi stops to ask (a scan it can't read): the reason reaches the PM, no polling to the deadline", async () => {
    connect();
    const seen = stubLumi({ status: "needs_context", output: { text: "", data: null }, pending: { type: "question", text: "The attached file is a scanned image and cannot be read as text." } });
    const p = await previewStatusReport(pm, PROSE, "scan.docx", null, NOW);
    expect(p.extractor).toBe("rules");
    expect(p.warnings.join(" ")).toMatch(/Lumi stopped instead of answering: “The attached file is a scanned image/);
    expect(seen.paths.filter((x) => x.startsWith("GET /runs"))).toEqual([]);
    expect(seen.deleted).toEqual(["/conversations/conv_test_1"]);
  });

  it("the PM ticks Lumi but it isn't connected: the rules read it and say so", async () => {
    disconnect();
    stubLumi();
    const p = await previewStatusReport(pm, TABLE, "table-3.docx", null, NOW, "lumi");
    expect(p.extractor).toBe("rules");
    expect(p.warnings.join(" ")).toMatch(/Lumi isn't connected/);
  });
});
