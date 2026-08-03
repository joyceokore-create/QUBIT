// Project Workspace documents (M-workspace): CRUD, tenant isolation, member-based view access.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createProject } from "@/server/projects";
import { setProjectMember } from "@/server/resources";
import { createDocument, listDocuments, getDocument } from "@/server/documents";
import { draftBrd } from "@/server/q/draft-brd";
import { generateReport } from "@/server/q/report";
import { canViewProject } from "@/lib/project-access";
import { ensureUsers, cleanupFixtureUsers } from "./_users";

describe("Workspace — documents + access", () => {
  let demoB: TenantContext;
  let riverbank: TenantContext;
  let memberUserId: string;
  let projectId: string;
  const projectIds: string[] = [];

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY; // deterministic BRD + report path
    const [k, r] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!k || !r) throw new Error("Seed required.");
    const kUsers = await ensureUsers(k.id, 2);
    const rUser = await withTenant({ tenantId: r.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    // ctx roles intentionally empty so access is decided purely by project membership.
    demoB = { tenantId: k.id, userId: kUsers[0].id, roles: [] };
    riverbank = { tenantId: r.id, userId: rUser.id, roles: [] };
    memberUserId = kUsers[1].id;
    const project = await createProject(demoB, {
      code: `DOC-${Date.now().toString().slice(-6)}`,
      name: "Workspace test project",
      type: "Project",
      priority: "Med",
      status: "Planning",
    });
    projectId = project.id;
    projectIds.push(project.id);
  });

  afterAll(async () => {
    await withTenant({ tenantId: demoB.tenantId, userId: "seed" }, async (tx) => {
      await tx.projectDocument.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.aiCallLog.deleteMany({ where: { userId: demoB.userId } });
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    });
    await cleanupFixtureUsers(demoB.tenantId);
    await prisma.$disconnect();
  });

  it("creates and reads a document", async () => {
    const doc = await createDocument(demoB, projectId, {
      title: "Field Sales BRD",
      kind: "BRD",
      content: "# Objective\nDigitise field sales.",
    });
    const list = await listDocuments(demoB, projectId);
    expect(list.some((d) => d.id === doc.id && d.kind === "BRD")).toBe(true);
    const detail = await getDocument(demoB, doc.id);
    expect(detail?.content).toContain("Digitise field sales");
  });

  it("keeps documents tenant-isolated (RLS)", async () => {
    expect(await listDocuments(riverbank, projectId)).toHaveLength(0);
  });

  it("Q drafts a BRD and files it In review for the PM", async () => {
    const { documentId, usedAi } = await draftBrd(demoB, projectId, { tenantName: "the fixture tenant" });
    expect(usedAi).toBe(false); // deterministic path
    const doc = await getDocument(demoB, documentId);
    expect(doc?.kind).toBe("BRD");
    expect(doc?.status).toBe("InReview");
    expect(doc?.source).toBe("AIDrafted");
    expect(doc?.content).toContain("Business Requirements Document");
    expect(doc?.content).toContain("Requirements & deliverables");
  });

  it("grounds the project report on attached documents", async () => {
    await createDocument(demoB, projectId, {
      title: "Payments spec — UNIQUE-MARKER-42",
      kind: "SRS", // M8-B renamed the register's types (docs/16 §6)
      content: "The system must reconcile mobile wallet transactions nightly.",
    });
    const { markdown } = await generateReport(demoB, { type: "project", targetId: projectId, tenantName: "the fixture tenant" });
    expect(markdown).toContain("UNIQUE-MARKER-42"); // the attached doc surfaces in the report
  });

  it("grants workspace view to a project member (no role needed), denies non-members", async () => {
    // The creator has no roles and is not a member → cannot view by membership.
    expect(await canViewProject({ ...demoB, userId: memberUserId }, projectId)).toBe(false);
    // Allocate them → now they can view.
    await setProjectMember(demoB, projectId, memberUserId, { role: "Developer" });
    expect(await canViewProject({ ...demoB, userId: memberUserId }, projectId)).toBe(true);
    // Cross-tenant user still cannot.
    expect(await canViewProject(riverbank, projectId)).toBe(false);
  });
});
