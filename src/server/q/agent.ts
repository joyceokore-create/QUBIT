import { withTenant, type TenantContext } from "@/lib/tenant";
import { listProjects, getProjectPanelData } from "@/server/projects";
import { listProjectTasks, getProjectProgress } from "@/server/project-tasks";
import { listBlockers } from "@/server/blockers";
import { listRisks } from "@/server/risks";
import { listWorkload } from "@/server/resources";
import { listDocuments, getDocument } from "@/server/documents";
import { listStatusUpdates } from "@/server/status-updates";
import { getIntegrationSummary } from "@/server/connectors";
import { mockEnabled, mockChat } from "@/server/q/mock";
import { llmChat, llmEnabled, llmModel, type LlmMessage, type LlmTool } from "@/server/q/llm";

/**
 * Agentic Q — a tool-using copilot. Instead of one pre-assembled report, Q calls
 * tenant-scoped tools on demand to answer free-form questions. Every tool runs under the
 * caller's TenantContext, so RLS makes it impossible for Q to reach another tenant's data.
 * Manual tool loop over the OpenAI-compatible Chat Completions API (Riverbank's internal
 * box, see src/server/q/llm.ts); graceful fallback to the deterministic mock with no provider.
 */

const MAX_STEPS = 8;

export interface ChatResult {
  reply: string;
  usedAi: boolean;
  toolsUsed: string[];
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// Tool schemas exposed to the model (OpenAI function format). Handlers (below) are bound to
// the caller's ctx, so every tool call is tenant-scoped.
function tool(name: string, description: string, props: Record<string, unknown> = {}, required: string[] = []): LlmTool {
  return {
    type: "function",
    function: { name, description, parameters: { type: "object", properties: props, required, additionalProperties: false } },
  };
}
const PROJECT_ID = { projectId: { type: "string" } };

const TOOLS: LlmTool[] = [
  tool("list_projects", "List all projects (code, name, status, priority, avg progress). Start here to find a project id."),
  tool("get_project", "Get one project's overview: status, progress, dates, budget, description, objective.", PROJECT_ID, ["projectId"]),
  tool("list_tasks", "List a project's tasks with status, plus auto-progress (completed/total).", PROJECT_ID, ["projectId"]),
  tool("list_blockers", "List blockers (severity, status). Omit projectId for all projects.", PROJECT_ID),
  tool("list_risks", "List risks (probability, impact, status). Omit projectId for all projects.", PROJECT_ID),
  tool("list_workload", "List people and their project allocations + over-allocation across the tenant."),
  tool("read_documents", "List and read a project's attached documents (BRD, plans) — text excerpts.", PROJECT_ID, ["projectId"]),
  tool("list_status_updates", "List a project's recent status updates (RAG + body).", PROJECT_ID, ["projectId"]),
  tool("github_status", "Live GitHub signals for a project if connected: last commit, open PRs, fixed vs not-yet-fixed issues.", PROJECT_ID, ["projectId"]),
];

function handlers(ctx: TenantContext): Record<string, (input: Record<string, unknown>) => Promise<unknown>> {
  const pid = (i: Record<string, unknown>) => String(i.projectId ?? "");
  return {
    list_projects: async () =>
      (await listProjects(ctx, {})).map((p) => ({ id: p.id, code: p.code, name: p.name, status: p.status, priority: p.priority, avgProgress: p.avgProgress })),
    get_project: async (i) => {
      const p = await getProjectPanelData(ctx, pid(i));
      if (!p) return { error: "not found" };
      return { code: p.code, name: p.name, status: p.status, priority: p.priority, avgProgress: p.avgProgress, description: p.description, objective: p.objective, dueDate: p.dueDate, budget: p.budget };
    },
    list_tasks: async (i) => {
      const [tasks, progress] = await Promise.all([listProjectTasks(ctx, pid(i)), getProjectProgress(ctx, pid(i))]);
      return { progress, tasks: tasks.map((t) => ({ title: t.title, status: t.status, phase: t.phase, assignee: t.assigneeName, priority: t.priority })) };
    },
    list_blockers: async (i) =>
      (await listBlockers(ctx, i.projectId ? { projectId: pid(i) } : {})).map((b) => ({ description: b.description, severity: b.severity, status: b.status, project: b.projectCode })),
    list_risks: async (i) =>
      (await listRisks(ctx, i.projectId ? { projectId: pid(i) } : {})).map((r) => ({ title: r.title, probability: r.probability, impact: r.impact, status: r.status, project: r.projectCode })),
    list_workload: async () =>
      (await listWorkload(ctx)).map((w) => ({ name: w.name, totalPct: w.totalPct, overAllocated: w.totalPct > 100, projects: w.allocations.map((a) => a.projectName) })),
    read_documents: async (i) => {
      const docs = await listDocuments(ctx, pid(i));
      const withText = await Promise.all(
        docs.slice(0, 4).map(async (d) => ({ title: d.title, kind: d.kind, status: d.status, excerpt: d.hasFile ? "(PDF)" : (await getDocument(ctx, d.id))?.content?.slice(0, 2500) ?? "" })),
      );
      return withText;
    },
    list_status_updates: async (i) =>
      (await listStatusUpdates(ctx, pid(i))).map((s) => ({ rag: s.rag, body: s.body, by: s.postedByName, at: s.createdAt })),
    github_status: async (i) => (await getIntegrationSummary(ctx, pid(i), "github")) ?? { info: "GitHub not connected for this project." },
  };
}

const SYSTEM = (tenantName: string, projectId?: string) =>
  `You are Q, the copilot inside QUBIT — a portfolio & project management app — working for ` +
  `${tenantName}. Answer the user's question about their projects, tasks, resources, risks, ` +
  `blockers, documents and connected developer tools. ALWAYS call the tools to fetch real ` +
  `data before answering — never guess or use prior knowledge. All data is the user's own ` +
  `tenant data and safe to use. Cite project codes. If a tool returns nothing, say the data ` +
  `isn't available rather than inventing it. Be concise and lead with the answer.` +
  (projectId ? ` The user is currently viewing project id "${projectId}" — default to it when they say "this project".` : "");

export async function runQChat(
  ctx: TenantContext,
  opts: { messages: ChatTurn[]; projectId?: string; tenantName: string },
): Promise<ChatResult> {
  if (!llmEnabled()) {
    if (mockEnabled()) {
      return mockChat(ctx, opts.messages);
    }
    return {
      reply: "The AI copilot needs the Q AI service configured to answer free-form questions. In the meantime, use the report shortcuts (Portfolio summary, Manager report, My work, or a project report).",
      usedAi: false,
      toolsUsed: [],
    };
  }

  const handle = handlers(ctx);
  const toolsUsed = new Set<string>();
  let inputTokens = 0;
  let outputTokens = 0;
  const start = Date.now();

  const messages: LlmMessage[] = opts.messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));

  let reply = "";
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await llmChat({
        system: SYSTEM(opts.tenantName, opts.projectId),
        tools: TOOLS,
        maxTokens: 2048,
        messages,
      });
      inputTokens += res.inputTokens;
      outputTokens += res.outputTokens;

      if (!res.toolCalls.length) {
        reply = res.text.trim();
        break;
      }

      // Echo the assistant's tool-call turn, then answer each call as a `tool` message.
      messages.push({ role: "assistant", content: res.text || null, tool_calls: res.toolCalls });
      for (const call of res.toolCalls) {
        toolsUsed.add(call.function.name);
        let out: unknown;
        try {
          const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          out = (await handle[call.function.name]?.(args as Record<string, unknown>)) ?? { error: "unknown tool" };
        } catch {
          out = { error: "tool failed" };
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out).slice(0, 12000) });
      }
    }
  } catch {
    return { reply: "Q hit an error reaching the model. Please try again.", usedAi: false, toolsUsed: [...toolsUsed] };
  }

  await withTenant(ctx, (tx) =>
    tx.aiCallLog.create({
      data: { tenantId: ctx.tenantId, userId: ctx.userId, purpose: "chat", model: llmModel(), usedAi: true, inputTokens, outputTokens, latencyMs: Date.now() - start },
    }),
  ).catch(() => {});

  return { reply: reply || "I couldn’t find an answer in your data.", usedAi: true, toolsUsed: [...toolsUsed] };
}
