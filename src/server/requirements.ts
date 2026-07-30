import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { emitDomainEvent } from "@/server/events";
import { llmChat, llmEnabled } from "@/server/q/llm";

/**
 * Requirements and traceability (docs/16 §6). Two rules shape this module:
 *
 *  1. **Extraction proposes; a human accepts.** Q reads a BRD/URS and returns CANDIDATES.
 *     Nothing becomes a real Requirement until somebody approves it on the review screen
 *     ("Q found this in your BRD"). There is no code path that auto-applies.
 *  2. **Every requirement keeps its source anchor** — the document and the section it
 *     came from — so coverage can report "URS §3.2 has no covering task" instead of an
 *     anonymous percentage.
 */

export interface RequirementCandidate {
  /** Section within the source document, e.g. "§3.2" or a heading. */
  sectionAnchor: string | null;
  text: string;
}

export interface RequirementRow {
  id: string;
  ref: string;
  text: string;
  sectionAnchor: string | null;
  sourceDocumentId: string | null;
  sourceDocumentTitle: string | null;
  /** Published tasks linked to this requirement — the coverage evidence. */
  linkedTasks: { id: string; title: string; status: string }[];
  covered: boolean;
}

export interface CoverageReport {
  total: number;
  covered: number;
  pct: number;
  /** The uncovered requirements, named by anchor — the report's whole point. */
  uncovered: { ref: string; sectionAnchor: string | null; text: string }[];
}

export class RequirementError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "BAD_INPUT",
  ) {
    super(message);
    this.name = "RequirementError";
  }
}

// ── Extraction (human-gated) ─────────────────────────────────────────────────────

const SYSTEM = [
  "You extract REQUIREMENTS from a business or user requirements document.",
  "Return one requirement per line, in the form: <section anchor> :: <requirement text>.",
  "Use the document's own section numbering or heading for the anchor when present, else '-'.",
  "A requirement states what the system MUST do. Skip background, goals and glossary.",
  "Never invent requirements that are not in the text.",
].join(" ");

/** Deterministic fallback: pull sentences that read like requirements, keeping the
 * nearest preceding heading or section number as the anchor. Used when the Q AI box is
 * unconfigured, so the feature works without an LLM rather than failing shut. */
export function parseCandidates(content: string): RequirementCandidate[] {
  const out: RequirementCandidate[] = [];
  let anchor: string | null = null;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // A heading or numbered section becomes the anchor for what follows.
    const heading = line.match(/^#{1,6}\s*(.+)$/) || line.match(/^(§?\d+(?:\.\d+)*)\s*[.)]?\s*(.*)$/);
    if (heading) {
      const label = (heading[1] ?? "").trim();
      if (label) anchor = label.startsWith("§") || /^\d/.test(label) ? label : label.slice(0, 60);
      const rest = (heading[2] ?? "").trim();
      if (!rest) continue;
    }
    // "must" / "shall" / "should" is the requirement smell every URS shares.
    if (/\b(must|shall|should|is required to)\b/i.test(line)) {
      out.push({ sectionAnchor: anchor, text: line.replace(/^[-*]\s*/, "").slice(0, 500) });
    }
  }
  return out;
}

/** Read a document and PROPOSE requirements. Never writes anything. */
export async function extractCandidates(
  ctx: TenantContext,
  documentId: string,
): Promise<{ candidates: RequirementCandidate[]; usedAi: boolean; documentTitle: string }> {
  const doc = await withTenant(ctx, (tx) =>
    tx.projectDocument.findUnique({
      where: { id: documentId },
      select: { id: true, title: true, content: true, kind: true },
    }),
  );
  if (!doc) throw new RequirementError("Document not found.", "NOT_FOUND");
  if (!doc.content?.trim()) {
    throw new RequirementError("That document has no text to read — upload or paste its content first.", "BAD_INPUT");
  }

  if (llmEnabled()) {
    try {
      const res = await llmChat({
        maxTokens: 2000,
        system: SYSTEM,
        messages: [{ role: "user", content: `Document: ${doc.title}\n\n${doc.content.slice(0, 20_000)}` }],
      });
      const candidates = (res.text ?? "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const [anchor, ...rest] = line.split("::");
          const text = rest.join("::").trim();
          if (!text) return null;
          const a = anchor.trim();
          return { sectionAnchor: a && a !== "-" ? a : null, text: text.slice(0, 500) };
        })
        .filter((c): c is RequirementCandidate => c !== null);
      if (candidates.length) return { candidates, usedAi: true, documentTitle: doc.title };
    } catch {
      /* fall through to the deterministic parse — never fail the screen shut */
    }
  }
  return { candidates: parseCandidates(doc.content), usedAi: false, documentTitle: doc.title };
}

export const AcceptCandidatesInput = z.object({
  documentId: z.string().min(1),
  accepted: z
    .array(z.object({ sectionAnchor: z.string().trim().max(120).nullable(), text: z.string().trim().min(3).max(500) }))
    .min(1, "Pick at least one requirement to accept.")
    .max(200),
});

/** Turn the human-approved candidates into real Requirements. Refs continue the
 * project's existing numbering so REQ-004 stays REQ-004 forever. */
export async function acceptCandidates(
  ctx: TenantContext,
  projectId: string,
  input: z.infer<typeof AcceptCandidatesInput>,
): Promise<RequirementRow[]> {
  await withTenant(ctx, async (tx) => {
    const existing = await tx.requirement.count({ where: { projectId } });
    let n = existing;
    for (const c of input.accepted) {
      n += 1;
      await tx.requirement.create({
        data: {
          tenantId: ctx.tenantId,
          projectId,
          sourceDocumentId: input.documentId,
          sectionAnchor: c.sectionAnchor,
          ref: `REQ-${String(n).padStart(3, "0")}`,
          text: c.text,
          createdById: ctx.userId,
        },
      });
    }
    await audit(tx, ctx, {
      action: "create",
      entityType: "requirement",
      entityId: projectId,
      after: { accepted: input.accepted.length, sourceDocumentId: input.documentId },
    });
    await emitDomainEvent(tx, ctx, {
      type: "requirements.accepted",
      entityType: "project",
      entityId: projectId,
      payload: { projectId, count: input.accepted.length, sourceDocumentId: input.documentId },
    });
  });
  return listRequirements(ctx, projectId);
}

// ── Traceability ─────────────────────────────────────────────────────────────────

export async function listRequirements(ctx: TenantContext, projectId: string): Promise<RequirementRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.requirement.findMany({
      where: { projectId, status: "Accepted" },
      select: {
        id: true, ref: true, text: true, sectionAnchor: true, sourceDocumentId: true,
        sourceDocument: { select: { title: true } },
        taskLinks: {
          select: { task: { select: { id: true, title: true, status: true, approvalStatus: true } } },
        },
      },
      orderBy: { ref: "asc" },
    });
    return rows.map((r) => {
      // Draft (unapproved) tasks are not evidence of anything.
      const linkedTasks = r.taskLinks
        .filter((l) => l.task.approvalStatus !== "Draft")
        .map((l) => ({ id: l.task.id, title: l.task.title, status: l.task.status }));
      return {
        id: r.id,
        ref: r.ref,
        text: r.text,
        sectionAnchor: r.sectionAnchor,
        sourceDocumentId: r.sourceDocumentId,
        sourceDocumentTitle: r.sourceDocument?.title ?? null,
        linkedTasks,
        covered: linkedTasks.length > 0,
      };
    });
  });
}

/** Coverage for one project — the number the UAT gate and the QA strip both read. */
export async function getCoverage(ctx: TenantContext, projectId: string): Promise<CoverageReport> {
  const rows = await listRequirements(ctx, projectId);
  const uncovered = rows.filter((r) => !r.covered);
  return {
    total: rows.length,
    covered: rows.length - uncovered.length,
    pct: rows.length ? Math.round(((rows.length - uncovered.length) / rows.length) * 100) : 0,
    uncovered: uncovered.map((r) => ({ ref: r.ref, sectionAnchor: r.sectionAnchor, text: r.text })),
  };
}

export const LinkTaskInput = z.object({ taskId: z.string().uuid(), linked: z.boolean() });

/** Link (or unlink) a task as covering a requirement. */
export async function setRequirementTaskLink(
  ctx: TenantContext,
  requirementId: string,
  taskId: string,
  linked: boolean,
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const req = await tx.requirement.findUnique({ where: { id: requirementId }, select: { id: true, projectId: true, ref: true } });
    if (!req) throw new RequirementError("Requirement not found.", "NOT_FOUND");
    const task = await tx.projectTask.findFirst({
      where: { id: taskId, projectId: req.projectId },
      select: { id: true },
    });
    // A task from another project is not evidence for this requirement.
    if (!task) throw new RequirementError("That task is not on this project.", "BAD_INPUT");

    if (linked) {
      await tx.requirementTaskLink.upsert({
        where: { requirementId_taskId: { requirementId, taskId } },
        create: { tenantId: ctx.tenantId, requirementId, taskId },
        update: {},
      });
    } else {
      await tx.requirementTaskLink.deleteMany({ where: { requirementId, taskId } });
    }
    await audit(tx, ctx, {
      action: "update",
      entityType: "requirement",
      entityId: requirementId,
      after: { ref: req.ref, taskId, linked },
    });
  });
}
