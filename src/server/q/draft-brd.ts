import { withTenant, type TenantContext } from "@/lib/tenant";
import { llmChat, llmEnabled, llmModel } from "@/server/q/llm";
import { getProjectPanelData } from "@/server/projects";
import { listProjectMembers, listProjectTeams } from "@/server/resources";
import { listProjectTasks } from "@/server/project-tasks";
import { listRisks } from "@/server/risks";
import { listBlockers } from "@/server/blockers";
import { createDocument } from "@/server/documents";
import { notifyUsers } from "@/server/notifications";

/**
 * Q drafts a Business Requirements Document from what QUBIT already knows about a project
 * (description, objective/mission, team, tasks, risks) and files it as a **draft pending the
 * project manager's review** (source=AIDrafted, status=PendingReview). Grounded only on the
 * provided data; graceful deterministic fallback when the Q AI box is unconfigured.
 */

export class DraftError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND",
  ) {
    super(message);
    this.name = "DraftError";
  }
}

export interface DraftResult {
  documentId: string;
  usedAi: boolean;
}

const SYSTEM =
  "You are Q, a senior business analyst. Draft a Business Requirements Document (BRD) in " +
  "GitHub-flavoured Markdown from the supplied project data. Structure it as: " +
  "**Overview** (objective, scope, deliverables, assumptions), **Stakeholders** (business " +
  "owner, team & roles), **Timeline & phases**, and **Risks**. Base everything ONLY on the " +
  "provided JSON — where a section lacks data, state the assumption explicitly rather than " +
  "inventing specifics. This is a first draft for the project manager to review and refine. " +
  "Return only the Markdown, no preamble, no code fences.";

export async function draftBrd(
  ctx: TenantContext,
  projectId: string,
  opts: { tenantName: string },
): Promise<DraftResult> {
  const project = await getProjectPanelData(ctx, projectId);
  if (!project) throw new DraftError("Project not found.", "NOT_FOUND");
  const [members, teams, tasks, risks, blockers] = await Promise.all([
    listProjectMembers(ctx, projectId),
    listProjectTeams(ctx, projectId),
    listProjectTasks(ctx, projectId),
    listRisks(ctx, { projectId }),
    listBlockers(ctx, { projectId }),
  ]);

  const data = {
    project: {
      code: project.code,
      name: project.name,
      client: project.client,
      description: project.description,
      objective: project.objective,
      mission: project.mission,
      businessOwner: project.businessOwner,
      lead: project.leadName,
      status: project.status,
      priority: project.priority,
      startDate: project.startDate ? project.startDate.toISOString().slice(0, 10) : null,
      dueDate: project.dueDate ? project.dueDate.toISOString().slice(0, 10) : null,
      budget: project.budget,
    },
    team: members.map((m) => ({ name: m.name, role: m.role, allocationPct: m.allocationPct })),
    teams: teams.map((t) => t.name),
    tasksByPhase: tasks.reduce<Record<string, string[]>>((acc, t) => {
      const phase = t.phase || "Unphased";
      (acc[phase] ??= []).push(t.title);
      return acc;
    }, {}),
    knownRisks: risks.map((r) => ({ title: r.title, probability: r.probability, impact: r.impact })),
    openBlockers: blockers.filter((b) => b.status === "Open").map((b) => ({ description: b.description, severity: b.severity })),
  };

  const fallback = buildFallbackBrd(project.name, data);

  let markdown = fallback;
  let usedAi = false;
  const start = Date.now();
  let usage = { input_tokens: 0, output_tokens: 0 };

  if (llmEnabled()) {
    try {
      const response = await llmChat({
        maxTokens: 3000,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Draft the BRD for ${opts.tenantName} from this data:\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
          },
        ],
      });
      usage = { input_tokens: response.inputTokens, output_tokens: response.outputTokens };
      const text = response.text.trim();
      if (text) {
        markdown = text;
        usedAi = true;
      }
    } catch {
      // fall back to the deterministic draft
    }
  }

  const doc = await createDocument(ctx, projectId, {
    title: `BRD (draft) — ${project.name}`,
    kind: "BRD",
    format: "markdown",
    content: markdown,
    status: "PendingReview",
    source: "AIDrafted",
  });

  await withTenant(ctx, (tx) =>
    tx.aiCallLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        purpose: "brd:draft",
        model: llmModel(),
        usedAi,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        latencyMs: Date.now() - start,
      },
    }),
  ).catch(() => {});

  // Notify the assigned PM (project lead) that a BRD is pending their review.
  await withTenant(ctx, async (tx) => {
    const proj = await tx.project.findUnique({ where: { id: projectId }, select: { leadUserId: true, name: true } });
    if (proj?.leadUserId && proj.leadUserId !== ctx.userId) {
      await notifyUsers(tx, ctx, [
        {
          userId: proj.leadUserId,
          kind: "brd_review",
          message: `Q drafted a BRD for ${proj.name} — pending your review`,
          link: `/projects/${projectId}`,
        },
      ]);
    }
  }).catch(() => {});

  return { documentId: doc.id, usedAi };
}

function buildFallbackBrd(name: string, data: Record<string, unknown>): string {
  const p = data.project as Record<string, string | null>;
  const team = data.team as { name: string; role: string; allocationPct: number | null }[];
  const teams = data.teams as string[];
  const tasksByPhase = data.tasksByPhase as Record<string, string[]>;
  const risks = data.knownRisks as { title: string; probability: number; impact: number }[];
  const blockers = data.openBlockers as { description: string; severity: string }[];
  const phases = Object.keys(tasksByPhase);
  const allTasks = Object.values(tasksByPhase).flat();

  const s = (out: string[]) => out.filter(Boolean).join("\n");
  return s([
    `# Business Requirements Document — ${name}`,
    `_Auto-drafted by Q from the project record. **Pending project-manager review.**_`,
    p.code ? `Project code: **${p.code}** · Status: ${p.status ?? "—"} · Priority: ${p.priority ?? "—"}` : "",

    `\n## 1. Overview`,
    `**Objective:** ${p.objective || p.description || "_To be confirmed with the business owner._"}`,
    p.mission ? `**Mission:** ${p.mission}` : "",
    p.client ? `**Client:** ${p.client}` : "",
    `**Scope:** ${phases.length ? `delivery across ${phases.join(", ")}.` : "to be defined."}`,
    `**Assumptions:** this draft reflects the current project record; figures and names are validated in review.`,

    `\n## 2. Stakeholders`,
    p.businessOwner ? `- **Business owner:** ${p.businessOwner}` : "",
    p.lead ? `- **Project lead:** ${p.lead}` : "",
    ...(team.length ? team.map((m) => `- ${m.name} — ${m.role}${m.allocationPct != null ? ` (${m.allocationPct}%)` : ""}`) : ["- _Team to be assigned._"]),
    teams.length ? `- **Teams:** ${teams.join(", ")}` : "",

    `\n## 3. Timeline`,
    `${p.startDate || p.dueDate ? `Planned ${p.startDate ?? "—"} → ${p.dueDate ?? "—"}.` : "_Dates to be confirmed._"}`,
    p.budget ? `Budget: ${p.budget}.` : "",
    phases.length ? `Phases: ${phases.join(" → ")}.` : "",

    `\n## 4. Requirements & deliverables (${allTasks.length})`,
    allTasks.length
      ? phases.map((ph) => `\n**${ph}**\n${tasksByPhase[ph].map((t) => `- ${t}`).join("\n")}`).join("\n")
      : "_No requirements captured yet — generate tasks from a document, or add them on the Board._",

    `\n## 5. Risks (${risks.length})`,
    risks.length ? risks.map((r) => `- ${r.title} — probability ${r.probability}, impact ${r.impact}`).join("\n") : "- _No risks logged yet._",

    `\n## 6. Open blockers (${blockers.length})`,
    blockers.length ? blockers.map((b) => `- **${b.severity}:** ${b.description}`).join("\n") : "- _None._",
  ]);
}
