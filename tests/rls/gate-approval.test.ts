// WS1 (UX fidelity Tier 4) — gate sign-off under the tenant's RLS context: a sign-off gate
// (Go-Live, SIT exit, UAT exit) set Done by the PM — by hand or by a status-report upload —
// is SUBMITTED, not closed; approvers are scoped (Head any gate, Head of QA testing gates,
// Executives none); nobody decides a gate they submitted (four-eyes); return and exception
// need a reason; approval closes the gate and runs the cascade, which stops at the next
// sign-off gate; every transition is audited; another tenant sees and touches nothing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getProjectCheckpoints, setCheckpointState } from "@/server/checkpoints";
import { approveGate, getGateReview, GateApprovalError, listGateQueue, returnGate, submitGate } from "@/server/gate-approval";
import { applyStatusReport } from "@/server/status-report-upload";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("WS1 gate sign-off", () => {
  const started = new Date();
  let rbId: string;
  let bId: string;
  let pm: TenantContext;
  let head: TenantContext;
  let head2: TenantContext;
  let hqa: TenantContext;
  let exec: TenantContext;
  let bHead: TenantContext;
  let projectId: string;
  let gate: Record<string, string> = {};

  const row = async (name: string) => (await getProjectCheckpoints(pm, projectId)).rows.find((r) => r.name === name)!;
  const code = (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof GateApprovalError ? e.code : e instanceof Error ? e.name : "error"));
  const auditOf = (action: string) =>
    withTenant(pm, (tx) => tx.auditLog.findMany({ where: { action, entityId: { startsWith: projectId } }, orderBy: { createdAt: "asc" }, select: { actorId: true, before: true, after: true } }));

  beforeAll(async () => {
    const [rb, b] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !b) throw new Error("Seed required — run `pnpm prisma:seed`.");
    rbId = rb.id;
    bId = b.id;
    const [p, h, h2, q, e] = await createUsers(rbId, 5, "ws1");
    const [bh] = await createUsers(bId, 1, "ws1b");
    pm = { tenantId: rbId, userId: p!.id, roles: ["ProjectManager"] };
    head = { tenantId: rbId, userId: h!.id, roles: ["HeadOfProjects"] };
    head2 = { tenantId: rbId, userId: h2!.id, roles: ["HeadOfProjects"] };
    hqa = { tenantId: rbId, userId: q!.id, roles: ["HeadOfQA"] };
    exec = { tenantId: rbId, userId: e!.id, roles: ["Executive"] };
    bHead = { tenantId: bId, userId: bh!.id, roles: ["HeadOfProjects"] };
    await withTenant(pm, async (tx) => {
      const tmpl = await tx.checkpointTemplate.findFirstOrThrow({ where: { name: "Product build" }, select: { id: true, checkpoints: { select: { id: true, name: true } } } });
      gate = Object.fromEntries(tmpl.checkpoints.map((c) => [c.name, c.id]));
      projectId = (
        await tx.project.create({
          data: { tenantId: rbId, code: `WS1-${Date.now() % 100000}`, name: "Gate sign-off fixture", type: "Project", priority: "Med", status: "OnTrack", leadUserId: p!.id, checkpointTemplateId: tmpl.id },
          select: { id: true },
        })
      ).id;
    });
  });

  afterAll(async () => {
    const actors = [pm, head, head2, hqa, exec].map((c) => c.userId);
    await withTenant(pm, async (tx) => {
      await tx.domainEvent.deleteMany({ where: { actorId: { in: actors } } });
      // Submissions notify the tenant's real Heads too — remove exactly what this run created.
      await tx.notification.deleteMany({ where: { kind: { startsWith: "gate." }, createdAt: { gte: started }, link: { in: ["/approvals?tab=gates", `/projects/${projectId}?tab=Delivery`] } } });
      await tx.checkIn.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(rbId);
    await cleanupFixtureUsers(bId);
    await prisma.$disconnect();
  });

  it("marks Go-Live, SIT and UAT as sign-off gates (by name), and no other", async () => {
    const rows = (await getProjectCheckpoints(pm, projectId)).rows;
    expect(rows.filter((r) => r.signOff).map((r) => r.name)).toEqual(["SIT", "UAT", "Go-Live"]);
    expect(rows.every((r) => r.approval === "none")).toBe(true);
  });

  it("a status-report upload that says Go-Live is done SUBMITS it (from the file), it does not close it", async () => {
    const [out] = await applyStatusReport(pm, { rows: [{ projectId, gates: [{ checkpointId: gate["Go-Live"]!, state: "Done" }] }], file: undefined }, new Date());
    expect(out).toMatchObject({ outcome: "none", gates: "Go-Live submitted for sign-off", problems: [] });
    const live = await row("Go-Live");
    expect(live).toMatchObject({ state: "NotStarted", approval: "submitted", submitted: { byId: pm.userId } });
    expect(live.source?.label).toMatch(/^Status report/);
    const [a] = await auditOf("gate.submit");
    expect(a).toMatchObject({ actorId: pm.userId, before: { approval: "none" }, after: { approval: "submitted", checkpoint: "Go-Live", via: "upload" } });
    // The approvers were told (one event, a notification per Head in the tenant).
    const ev = await withTenant(pm, (tx) => tx.domainEvent.findFirst({ where: { type: "gate.submitted", actorId: pm.userId }, select: { payload: true } }));
    expect(ev?.payload).toMatchObject({ projectId, checkpoint: "Go-Live", via: "upload" });
  });

  it("the PM setting Done again changes nothing — it is already waiting", async () => {
    await setCheckpointState(pm, projectId, { checkpointId: gate["Go-Live"]!, state: "Done" });
    expect(await auditOf("gate.submit")).toHaveLength(1);
    expect((await row("Go-Live")).state).toBe("NotStarted");
  });

  it("approver scope: Head any gate; Head of QA testing gates only; Executive and PM never", async () => {
    const statusId = (await row("Go-Live")).statusId!;
    expect((await listGateQueue(head, "approver")).map((g) => g.statusId)).toContain(statusId);
    expect((await listGateQueue(hqa, "approver")).map((g) => g.statusId)).not.toContain(statusId);
    expect(await listGateQueue(exec, "approver")).toEqual([]);
    expect((await listGateQueue(pm, "mine")).map((g) => g.statusId)).toContain(statusId);
    expect(await code(approveGate(hqa, projectId, statusId, {}))).toBe("NOT_APPROVER");
    expect(await code(approveGate(exec, projectId, statusId, {}))).toBe("NOT_APPROVER");
    expect(await code(returnGate(exec, projectId, statusId, { note: "Not convinced yet" }))).toBe("NOT_APPROVER");
    expect(await code(approveGate(pm, projectId, statusId, {}))).toBe("NOT_APPROVER");
  });

  it("an unmet checklist needs an exception; a return needs a reason and leaves state alone", async () => {
    const statusId = (await row("Go-Live")).statusId!;
    expect(await code(approveGate(head, projectId, statusId, {}))).toBe("NEEDS_EXCEPTION");
    expect(await code(returnGate(head, projectId, statusId, { note: "no" }))).toBe("ZodError");
    await returnGate(head, projectId, statusId, { note: "Handover document is not approved yet." });
    expect(await row("Go-Live")).toMatchObject({ state: "NotStarted", approval: "returned", decided: { note: "Handover document is not approved yet." } });
    const mine = (await listGateQueue(pm, "mine")).find((g) => g.statusId === statusId);
    expect(mine).toMatchObject({ approval: "returned", decisionNote: "Handover document is not approved yet.", canDecide: false });
    const [r] = await auditOf("gate.return");
    expect(r).toMatchObject({ actorId: head.userId, before: { approval: "submitted" }, after: { approval: "returned", decisionNote: "Handover document is not approved yet." } });
    const told = await withTenant(pm, (tx) => tx.notification.findFirst({ where: { userId: pm.userId, kind: "gate.returned" }, select: { message: true } }));
    expect(told?.message).toMatch(/returned: Handover document/);
  });

  it("the PM resubmits; approving with exception closes the gate, stamps the reason and audits it", async () => {
    const statusId = (await row("Go-Live")).statusId!;
    await submitGate(pm, projectId, statusId);
    expect(await code(submitGate(pm, projectId, statusId))).toBe("ALREADY_SUBMITTED");
    expect(await code(approveGate(head, projectId, statusId, { exception: true }))).toBe("NOTE_REQUIRED");
    await approveGate(head, projectId, statusId, { exception: true, note: "Client accepted the handover by email." });
    expect(await row("Go-Live")).toMatchObject({ state: "Done", approval: "approved_with_exception", overrideReason: "Client accepted the handover by email." });
    const [a] = await auditOf("gate.approve_exception");
    expect(a).toMatchObject({ actorId: head.userId, before: { approval: "submitted" }, after: { approval: "approved_with_exception", state: "Done" } });
    expect(await code(submitGate(pm, projectId, statusId))).toBe("ALREADY_DONE");
    // The approval ran the cascade on the track: UAT (sign-off) was in the way, so it was
    // submitted — by the approver — and nothing before it moved.
    expect(await row("UAT")).toMatchObject({ state: "NotStarted", approval: "submitted", submitted: { byId: head.userId } });
    for (const name of ["BRD", "Prototype", "MVP1", "SIT"]) expect((await row(name)).state, name).toBe("NotStarted");
  });

  it("four-eyes on the direct path: the Head who submitted UAT setting it Done leaves it waiting", async () => {
    await setCheckpointState(head, projectId, { checkpointId: gate.UAT!, state: "Done", cascade: true });
    expect(await row("UAT")).toMatchObject({ state: "NotStarted", approval: "submitted" });
    expect(await code(approveGate(head, projectId, (await row("UAT")).statusId!, {}))).toBe("FOUR_EYES");
  });

  it("another Head setting it Done is an implicit approval; the cascade then SUBMITS the next sign-off gate and stops", async () => {
    await setCheckpointState(head2, projectId, { checkpointId: gate.UAT!, state: "Done", cascade: true });
    expect(await row("UAT")).toMatchObject({ state: "Done", approval: "approved" });
    expect((await auditOf("gate.approve")).some((a) => a.actorId === head2.userId && (a.after as { implicit?: boolean }).implicit === true)).toBe(true);
    // SIT (sign-off) was in the way: submitted, not closed — and nothing before it moved.
    expect(await row("SIT")).toMatchObject({ state: "NotStarted", approval: "submitted", submitted: { byId: head2.userId } });
    for (const name of ["BRD", "Prototype", "MVP1"]) expect((await row(name)).state, name).toBe("NotStarted");
  });

  it("four-eyes: the Head who submitted SIT (via the cascade) can't sign it off; Head of QA can, and the cascade closes what it may", async () => {
    const sit = (await row("SIT")).statusId!;
    expect(await code(approveGate(head2, projectId, sit, {}))).toBe("FOUR_EYES");
    expect((await listGateQueue(head2, "approver")).map((g) => g.statusId)).not.toContain(sit);
    expect((await listGateQueue(hqa, "approver")).map((g) => g.statusId)).toContain(sit);
    const review = await getGateReview(hqa, projectId, sit);
    expect(review).toMatchObject({ item: { testing: true, canDecide: true }, critical: { total: 0 }, exceptionAllowed: false });
    await approveGate(hqa, projectId, sit, {});
    expect(await row("SIT")).toMatchObject({ state: "Done", approval: "approved" });
    // The cascade from SIT: Prototype has no checklist → closes; BRD and MVP1 checklists are
    // unmet → left for the PM, exactly as before WS1.
    expect((await row("Prototype")).state).toBe("Done");
    expect((await row("BRD")).state).toBe("NotStarted");
    expect((await row("MVP1")).state).toBe("NotStarted");
  });

  it("reopening a signed-off gate clears its sign-off", async () => {
    await setCheckpointState(head, projectId, { checkpointId: gate["Go-Live"]!, state: "InProgress" });
    expect(await row("Go-Live")).toMatchObject({ state: "InProgress", approval: "none", decided: null });
  });

  it("RLS: another tenant can neither see nor decide these gates", async () => {
    const ids = (await getProjectCheckpoints(pm, projectId)).rows.map((r) => r.statusId).filter((x): x is string => Boolean(x));
    const theirs = await listGateQueue(bHead, "approver");
    for (const id of ids) expect(theirs.map((g) => g.statusId)).not.toContain(id);
    // Submit one more so there is something waiting, then try it from tenant B.
    await setCheckpointState(pm, projectId, { checkpointId: gate["Go-Live"]!, state: "Done" });
    const live = (await row("Go-Live")).statusId!;
    expect(await code(approveGate(bHead, projectId, live, {}))).toBe("NOT_FOUND");
    expect(await code(returnGate(bHead, projectId, live, { note: "Cross-tenant attempt" }))).toBe("NOT_FOUND");
    expect(await code(getGateReview(bHead, projectId, live))).toBe("NOT_FOUND");
    expect(await row("Go-Live")).toMatchObject({ approval: "submitted" });
    const leaked = await withTenant(bHead, (tx) => tx.checkpointStatus.count({ where: { projectId } }));
    expect(leaked).toBe(0);
  });
});
