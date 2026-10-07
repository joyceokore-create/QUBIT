// A project is run by its PM: the first "Project Manager" assigned to a lead-less project
// becomes its lead (audited), later PMs don't displace them, and the cockpit treats lead
// and PM members alike as "runs it" — so a PM's dashboard shows THEIR projects, never the
// whole estate because a lead was never set.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { addProjectMembers, setProjectMember } from "@/server/resources";
import { getCockpitData } from "@/server/dashboard-cockpit";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("lead from the first Project Manager", () => {
  let rbId: string;
  let head: TenantContext;
  let pmA: string;
  let pmB: string;
  let dev: string;
  let a: string;
  let b: string;

  beforeAll(async () => {
    const rb = await prisma.tenant.findUnique({ where: { slug: "riverbank" } });
    if (!rb) throw new Error("Seed required.");
    rbId = rb.id;
    const [h, p1, p2, d] = await createUsers(rbId, 4, "lpm");
    head = { tenantId: rbId, userId: h.id, roles: ["HeadOfProjects"] };
    pmA = p1.id;
    pmB = p2.id;
    dev = d.id;
    const mk = (code: string) =>
      withTenant(head, (tx) => tx.project.create({ data: { tenantId: rbId, code, name: `Lead ${code}`, type: "Project", priority: "Med", status: "Planning" }, select: { id: true } })).then((x) => x.id);
    [a, b] = await Promise.all([mk("LPM-A"), mk("LPM-B")]);
  });

  afterAll(async () => {
    await withTenant(head, async (tx) => {
      await tx.projectMember.deleteMany({ where: { projectId: { in: [a, b] } } });
      await tx.notification.deleteMany({ where: { userId: { in: [pmA, pmB, dev] } } });
      await tx.domainEvent.deleteMany({ where: { entityId: { in: [a, b] } } });
      await tx.auditLog.deleteMany({ where: { actorId: head.userId } });
      await tx.project.deleteMany({ where: { id: { in: [a, b] } } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("bulk-assigning a Project Manager to a lead-less project makes them lead; a developer does not; a second PM does not displace", async () => {
    await addProjectMembers(head, a, { members: [{ userId: dev, role: "Developer" }], acceptedWarnings: [] });
    expect((await withTenant(head, (tx) => tx.project.findUniqueOrThrow({ where: { id: a }, select: { leadUserId: true } }))).leadUserId).toBeNull();

    await addProjectMembers(head, a, { members: [{ userId: pmA, role: "Project Manager" }, { userId: pmB, role: "Project Manager" }], acceptedWarnings: [] });
    expect((await withTenant(head, (tx) => tx.project.findUniqueOrThrow({ where: { id: a }, select: { leadUserId: true } }))).leadUserId).toBe(pmA);
    const audit = await withTenant(head, (tx) => tx.auditLog.findFirst({ where: { entityType: "project", entityId: a, actorId: head.userId }, orderBy: { createdAt: "desc" }, select: { after: true } }));
    expect(audit?.after).toMatchObject({ leadUserId: pmA, reason: "first Project Manager assigned" });

    // The single-member path does the same, and never overrides an existing lead.
    await setProjectMember(head, b, pmB, { role: "Project Manager" });
    expect((await withTenant(head, (tx) => tx.project.findUniqueOrThrow({ where: { id: b }, select: { leadUserId: true } }))).leadUserId).toBe(pmB);
    await setProjectMember(head, b, pmA, { role: "Project Manager" });
    expect((await withTenant(head, (tx) => tx.project.findUniqueOrThrow({ where: { id: b }, select: { leadUserId: true } }))).leadUserId).toBe(pmB);
  });

  it("the cockpit counts the lead and every Project Manager member as running the project", async () => {
    const data = await getCockpitData(head);
    const pa = data.projects.find((p) => p.id === a)!;
    expect(pa.pmId).toBe(pmA);
    expect(new Set(pa.pmIds)).toEqual(new Set([pmA, pmB]));
    expect(pa.pmIds).not.toContain(dev);
  });
});
