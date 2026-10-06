// Milestone D — the roll-up distribution list: Head-managed, a tenant user or a typed
// address, duplicates refused, every change audited, invisible across tenants.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { addRecipient, listCandidates, listRecipients, removeRecipient } from "@/server/rollup-recipients";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("Milestone D — roll-up recipients", () => {
  let rbId: string;
  let dbId: string;
  let head: TenantContext;
  let pm: TenantContext;
  let execId: string;

  beforeAll(async () => {
    const [rb, db] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [h, p, e] = await createUsers(rbId, 3, "rcp");
    head = { tenantId: rbId, userId: h.id, roles: ["HeadOfProjects"] };
    pm = { tenantId: rbId, userId: p.id, roles: ["ProjectManager"] };
    execId = e.id;
    await withTenant(head, (tx) => tx.roleAssignment.create({ data: { tenantId: rbId, userId: execId, role: "Executive", scopeType: "Tenant" } }));
  });

  afterAll(async () => {
    await withTenant(head, async (tx) => {
      await tx.rollupRecipient.deleteMany({ where: { OR: [{ userId: execId }, { email: { endsWith: "@fixture.invalid" } }] } });
      await tx.auditLog.deleteMany({ where: { entityType: "rollup_recipient", actorId: head.userId } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("lists an executive as a candidate, adds them, refuses the duplicate, adds an address, removes — audited", async () => {
    expect((await listCandidates(head)).some((c) => c.userId === execId && c.roles.includes("Executive"))).toBe(true);

    const row = await addRecipient(head, { userId: execId });
    expect(row.userId).toBe(execId);
    expect(row.name).toMatch(/^Fixture RCP/);
    expect((await listCandidates(head)).some((c) => c.userId === execId)).toBe(false);
    await expect(addRecipient(head, { userId: execId })).rejects.toMatchObject({ code: "ALREADY_LISTED" });
    await expect(addRecipient(head, { email: row.email.toUpperCase() })).rejects.toMatchObject({ code: "ALREADY_LISTED" });

    const typed = await addRecipient(head, { email: "Board.Member@fixture.invalid" });
    expect(typed).toMatchObject({ email: "board.member@fixture.invalid", name: null, userId: null });

    const list = await listRecipients(head);
    expect(list.map((r) => r.email).sort()).toEqual([row.email, typed.email].sort());
    // Any report reader may see the list; only the Head may change it.
    expect((await listRecipients(pm)).length).toBe(2);
    await expect(addRecipient(pm, { email: "x@fixture.invalid" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(removeRecipient(pm, typed.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Another tenant sees nothing and cannot remove ours.
    const other: TenantContext = { tenantId: dbId, userId: "intruder", roles: ["HeadOfProjects"] };
    expect(await listRecipients(other)).toEqual([]);
    await expect(removeRecipient(other, typed.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await removeRecipient(head, typed.id);
    expect((await listRecipients(head)).map((r) => r.id)).toEqual([row.id]);

    const audits = await withTenant(head, (tx) => tx.auditLog.findMany({ where: { entityType: "rollup_recipient", actorId: head.userId }, select: { action: true } }));
    expect(audits.map((a) => a.action).sort()).toEqual(["create", "create", "delete"]);
  });
});
