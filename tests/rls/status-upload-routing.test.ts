// Plan Phase 2 — a consolidated report covering other PMs' projects. A line that names
// (exactly) a project somebody else runs is labelled with its PM, sent only on request, and
// never written to their project by the uploader. The PM sees it on their Weekly Update and
// uses it (applied on save, uploader told) or dismisses it (uploader told). Ownership is
// re-checked at send time; Heads keep writing every project directly; nothing crosses a tenant.
import { deflateRawSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getCurrentCheckIn } from "@/server/checkins";
import { getDocument } from "@/server/documents";
import { applyStatusReport, dismissRoutedLine, getStatusWorkspace, previewStatusReport, routeUploadLines, UploadNotFoundError } from "@/server/status-report-upload";
import { createUsers, cleanupFixtureUsers } from "./_users";

const NOW = new Date("2026-10-07T10:00:00Z");

/** A Word file with one status table (the parser itself is unit-tested). */
function docx(rows: [string, string, string][]): Buffer {
  const runs = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const cell = (t: string) => `<w:tc><w:p>${runs(t)}</w:p></w:tc>`;
  const tr = (cells: string[]) => `<w:tr>${cells.map(cell).join("")}</w:tr>`;
  const xml = `<?xml version="1.0"?><w:document><w:body><w:tbl>${tr(["Project", "Status", "Update and Outlook"])}${rows.map(tr).join("")}</w:tbl></w:body></w:document>`;
  const raw = Buffer.from(xml, "utf8");
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
  const offset = local.length + name.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cenBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([local, name, data, cenBuf, eocd]);
}

describe("status-report upload — lines for other PMs' projects", () => {
  let rbId: string;
  let dbId: string;
  let pmA: TenantContext;
  let pmB: TenantContext;
  let pmC: TenantContext;
  let head: TenantContext;
  let alpha: string;
  let bravo: string;
  let nobody: string;
  let foreign: string;
  const users: string[] = [];
  const projects: string[] = [];

  beforeAll(async () => {
    const [rb, db] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [a, b, c, h] = await createUsers(rbId, 4, "rtg");
    users.push(a.id, b.id, c.id, h.id);
    pmA = { tenantId: rbId, userId: a.id, roles: ["ProjectManager"] };
    pmB = { tenantId: rbId, userId: b.id, roles: ["ProjectManager"] };
    pmC = { tenantId: rbId, userId: c.id, roles: ["ProjectManager"] };
    head = { tenantId: rbId, userId: h.id, roles: ["HeadOfProjects"] };
    const mk = (tenantId: string, code: string, name: string, lead: string | null) =>
      withTenant({ tenantId, userId: "seed" }, (tx) => tx.project.create({ data: { tenantId, code, name, type: "Project", priority: "Med", status: "OnTrack", leadUserId: lead }, select: { id: true } })).then((x) => x.id);
    alpha = await mk(rbId, "RTG-A", "Routing Alpha", pmA.userId);
    bravo = await mk(rbId, "RTG-B", "Routing Bravo", pmB.userId);
    nobody = await mk(rbId, "RTG-N", "Routing Nobody", null);
    foreign = await mk(dbId, "RTG-X", "Routing Foreign", null);
    projects.push(alpha, bravo, nobody);
  });

  afterAll(async () => {
    await withTenant({ tenantId: rbId, userId: "seed" }, async (tx) => {
      await tx.projectDocument.deleteMany({ where: { projectId: { in: projects } } });
      const uploads = await tx.statusUpload.findMany({ where: { uploadedById: { in: users } }, select: { id: true } });
      await tx.domainEvent.deleteMany({ where: { entityId: { in: [...uploads.map((u) => u.id), ...projects] } } });
      await tx.statusUpload.deleteMany({ where: { uploadedById: { in: users } } });
      await tx.notification.deleteMany({ where: { userId: { in: users } } });
      await tx.checkIn.deleteMany({ where: { projectId: { in: projects } } });
      await tx.auditLog.deleteMany({ where: { actorId: { in: users } } });
      await tx.project.deleteMany({ where: { id: { in: projects } } });
    });
    await withTenant({ tenantId: dbId, userId: "seed" }, (tx) => tx.project.deleteMany({ where: { id: foreign } }));
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  const report = (bravoLine = "Bravo waits on the vendor's API keys.") =>
    docx([
      ["Routing Alpha", "Green", "Alpha had a fine week."],
      ["Routing Bravo", "Amber", bravoLine],
      ["Routing Nobody", "Red", "Nobody runs this one."],
      ["Routing Foreign", "Green", "Another tenant's project."],
    ]);

  it("labels a colleague's project with its PM, and leaves a project nobody runs (or another tenant's) unplaced", async () => {
    const p = await previewStatusReport(pmA, report(), "portfolio.docx", null, NOW);
    const by = (name: string) => p.rows.find((r) => r.project === name)!;
    expect(by("Routing Alpha")).toMatchObject({ owner: null, match: { projectId: alpha, confidence: "exact" } });
    expect(by("Routing Bravo")).toMatchObject({ owner: { userId: pmB.userId }, match: { projectId: bravo, confidence: "exact" }, delivery: null, computedRag: null });
    // Nobody runs it: there's no one to send it to, so it is never labelled for sending.
    expect(by("Routing Nobody").owner).toBeNull();
    expect(by("Routing Nobody").match.projectId).not.toBe(nobody);
    // Another tenant's project is invisible (RLS): at most a fuzzy guess at one of the
    // uploader's own projects, which they must confirm — never labelled for sending.
    expect(by("Routing Foreign").owner).toBeNull();
    expect(by("Routing Foreign").match.projectId).not.toBe(foreign);
    expect(by("Routing Foreign").match.confidence).not.toBe("exact");
    // The uploader can't pick a colleague's project as their own.
    expect(p.projects.map((x) => x.id)).not.toContain(bravo);
    const stored = await withTenant(pmA, (tx) => tx.statusUploadRow.findFirstOrThrow({ where: { uploadId: p.uploadId, projectId: bravo }, select: { ownerUserId: true, state: true } }));
    expect(stored).toEqual({ ownerUserId: pmB.userId, state: "pending" });
  });

  it("sends only lines for projects someone else runs, writes nothing to them, and tells their PM", async () => {
    const p = await previewStatusReport(pmA, report(), "portfolio.docx", null, NOW);
    const lines = p.rows.map((r) => r.line);
    // Another person can't send the uploader's lines.
    await expect(routeUploadLines(pmB, p.uploadId, lines)).rejects.toBeInstanceOf(UploadNotFoundError);
    const sent = await routeUploadLines(pmA, p.uploadId, lines);
    expect(sent.routed).toBe(1);
    expect(sent.owners).toHaveLength(1);
    // Sending twice doesn't send again.
    expect((await routeUploadLines(pmA, p.uploadId, lines)).routed).toBe(0);

    expect((await getCurrentCheckIn(pmB, bravo, NOW)).narrative ?? "").not.toMatch(/vendor/);
    const note = await withTenant(pmB, (tx) => tx.notification.findFirst({ where: { userId: pmB.userId, kind: "status_upload.routed" }, select: { message: true, link: true } }));
    expect(note?.message).toMatch(/RTG-B/);
    expect(note?.link).toMatch(/^\/reports\/update\?week=2026-W41$/);

    // It waits on the PM's Weekly Update — not on the uploader's.
    const wsB = await getStatusWorkspace(pmB, null, NOW);
    const card = wsB.projects.find((x) => x.catalog.projectId === bravo)!;
    expect(card.routed).toHaveLength(1);
    expect(card.routed[0]).toMatchObject({ row: { update: "Bravo waits on the vendor's API keys.", status: "Amber" } });
    expect((await getStatusWorkspace(pmA, null, NOW)).projects.flatMap((x) => x.routed)).toEqual([]);
  });

  it("applies a used line on the PM's save: accepted, attached once, uploader told", async () => {
    const card = (await getStatusWorkspace(pmB, null, NOW)).projects.find((x) => x.catalog.projectId === bravo)!;
    const rowId = card.routed[0]!.rowId;
    // The uploader can't dismiss (or otherwise act on) the line on Bravo.
    await expect(dismissRoutedLine(pmA, rowId)).rejects.toBeInstanceOf(UploadNotFoundError);
    const [out] = await applyStatusReport(pmB, { rows: [{ projectId: bravo, rag: "Amber", narrative: "Bravo waits on the vendor's API keys.", routedRowIds: [rowId] }] }, NOW);
    expect(out).toMatchObject({ outcome: "drafted", attached: true });
    const ci = await getCurrentCheckIn(pmB, bravo, NOW);
    expect(ci.narrative).toBe("Bravo waits on the vendor's API keys.");
    const row = await withTenant(pmB, (tx) => tx.statusUploadRow.findUniqueOrThrow({ where: { id: rowId }, select: { state: true, appliedCheckInId: true, uploadId: true } }));
    expect(row).toMatchObject({ state: "accepted", appliedCheckInId: ci.id });
    const docs = await withTenant(pmB, (tx) => tx.projectDocument.findMany({ where: { projectId: bravo }, select: { id: true, title: true, statusUploadId: true } }));
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ statusUploadId: row.uploadId, title: expect.stringMatching(/from Fixture RTG1/) });
    expect((await getDocument(pmB, docs[0]!.id))?.hasFile).toBe(true);
    expect(await withTenant(pmA, (tx) => tx.notification.count({ where: { userId: pmA.userId, kind: "status_upload.accepted" } }))).toBe(1);
    // Used once: it's gone from the card, and accepting it again is a no-op.
    expect((await getStatusWorkspace(pmB, null, NOW)).projects.find((x) => x.catalog.projectId === bravo)!.routed).toEqual([]);
  });

  it("lets the PM dismiss a line, telling the uploader", async () => {
    const p = await previewStatusReport(pmA, report("Bravo: a second opinion."), "portfolio-2.docx", null, NOW);
    await routeUploadLines(pmA, p.uploadId, p.rows.map((r) => r.line));
    const card = (await getStatusWorkspace(pmB, null, NOW)).projects.find((x) => x.catalog.projectId === bravo)!;
    expect(card.routed).toHaveLength(1);
    await dismissRoutedLine(pmB, card.routed[0]!.rowId);
    expect((await getStatusWorkspace(pmB, null, NOW)).projects.find((x) => x.catalog.projectId === bravo)!.routed).toEqual([]);
    expect(await withTenant(pmA, (tx) => tx.notification.count({ where: { userId: pmA.userId, kind: "status_upload.dismissed" } }))).toBe(1);
    expect((await getCurrentCheckIn(pmB, bravo, NOW)).narrative).toBe("Bravo waits on the vendor's API keys.");
  });

  it("re-checks ownership at send time: a project that changed hands isn't sent to its old PM", async () => {
    const p = await previewStatusReport(pmA, report("Bravo: changed hands."), "portfolio-3.docx", null, NOW);
    await withTenant(pmA, (tx) => tx.project.update({ where: { id: bravo }, data: { leadUserId: pmC.userId } }));
    try {
      expect((await routeUploadLines(pmA, p.uploadId, p.rows.map((r) => r.line))).routed).toBe(0);
    } finally {
      await withTenant(pmA, (tx) => tx.project.update({ where: { id: bravo }, data: { leadUserId: pmB.userId } }));
    }
  });

  it("keeps a Head's direct write: every project is theirs, nothing is labelled for sending", async () => {
    const p = await previewStatusReport(head, report(), "portfolio.docx", null, NOW);
    expect(p.rows.find((r) => r.project === "Routing Bravo")).toMatchObject({ owner: null, match: { projectId: bravo, confidence: "exact" } });
    expect(p.rows.every((r) => r.owner === null)).toBe(true);
  });
});
