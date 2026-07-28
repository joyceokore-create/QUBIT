import { withTenant, type TenantContext } from "@/lib/tenant";
import { reportableUserIds } from "@/lib/access";
import { listProjects, getProjectPanelData, type ProjectListItem } from "@/server/projects";
import { needsAttention, ragRank } from "@/server/health";
import { listProjectMembers, listWorkload, type WorkloadRow } from "@/server/resources";
import { listBlockers } from "@/server/blockers";
import { listRisks } from "@/server/risks";
import { listDocuments } from "@/server/documents";
import { getIntegrationSummary } from "@/server/connectors";
import { llmEnabled } from "@/server/q/llm";
import type { GeneratedPlan } from "@/server/project-tasks";

/**
 * Mock AI mode (Q_MOCK_AI=1) — Q answers from live tenant data with no AI provider.
 * Deterministic (rules + templating), but capable: fuzzy entity resolution, conversation
 * follow-ups, compound questions, project comparison, per-person deep-dives, heuristic
 * "why / what should I do", attention briefings, counts, superlatives and time queries.
 * Labelled "Simulated Q"; auto-disabled once the Q AI box is configured (Q_AI_BASE_URL + key).
 */
export function mockEnabled(): boolean {
  if (llmEnabled()) return false;
  return ["1", "true", "yes", "on"].includes((process.env.Q_MOCK_AI ?? "").toLowerCase());
}

const NOTE = "\n\n_Simulated Q (mock mode) — configure the Q AI service for full agentic answers._";

export interface MockTurn {
  role: "user" | "assistant";
  content: string;
}

export function mockPlanFromText(text: string): GeneratedPlan {
  const lines = (text ?? "")
    .split(/\n|(?<=\.)\s+/)
    .map((s) => s.replace(/^[-*•\d.\s]+/, "").trim())
    .filter((s) => s.length > 8 && s.length < 160)
    .slice(0, 8);
  const mk = (title: string, ownerRole: string, priority: "Low" | "Medium" | "High" | "Critical" = "Medium") => ({
    title,
    description: "",
    ownerRole,
    priority,
    estimate: "",
  });
  const reqTasks = lines.length ? lines.map((l) => mk(l.slice(0, 90), "Business Analyst")) : [mk("Capture functional requirements", "Business Analyst")];
  return {
    summary: lines[0] ? `Derived from the provided document: ${lines[0].slice(0, 120)}` : "Derived from the provided requirements.",
    risks: [],
    phases: [
      { name: "Discovery", tasks: [mk("Stakeholder interviews", "Business Analyst"), mk("Current-state assessment", "Business Analyst")] },
      { name: "Requirements", tasks: reqTasks },
      { name: "Design", tasks: [mk("Solution design", "Technical Lead"), mk("UX wireframes", "UX Designer")] },
      { name: "Development", tasks: [mk("Implement core features", "Developer", "High"), mk("Build integrations", "Developer")] },
      { name: "Testing", tasks: [mk("Write & run test pack", "QA Lead", "High")] },
      { name: "UAT", tasks: [mk("UAT sign-off", "QA Lead", "High")] },
      { name: "Deployment", tasks: [mk("Go-live & hypercare", "Project Manager", "High")] },
    ],
  };
}

// ── fuzzy matching (typo tolerance) ──────────────────────────────────────────
function lev(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
// Common words that must never fuzzy-match a project/person name (else a global question
// like "what needs my attention today" gets hijacked by a look-alike project word).
const STOP = new Set([
  "what", "needs", "need", "attention", "today", "tomorrow", "most", "work", "working", "does",
  "have", "project", "projects", "status", "which", "whos", "when", "the", "and", "tell", "about",
  "this", "that", "give", "show", "list", "doing", "going", "over", "into", "from", "with", "your",
  "team", "people", "risk", "risks", "blocker", "blockers", "help", "compare", "versus", "budget",
  "overdue", "deadline", "should", "priorities",
]);
/** Conservative fuzzy match: term ≥5 chars, a non-stopword token ≥5 chars within edit-distance 1. */
function fuzzyWord(tokens: string[], term: string): boolean {
  if (term.length < 5) return false;
  return tokens.some((t) => t.length >= 5 && !STOP.has(t) && lev(t, term) <= 1);
}

// ── entity resolution ────────────────────────────────────────────────────────
function scoreProject(p: ProjectListItem, ql: string, tokens: string[]): number {
  const c = p.code.toLowerCase();
  if (ql.includes(c) || ql.replace(/[-\s]/g, "").includes(c.replace(/-/g, ""))) return 100;
  const words = p.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const exact = words.filter((w) => ql.includes(w)).length;
  const fuzzy = words.filter((w) => w.length >= 5 && !ql.includes(w) && fuzzyWord(tokens, w)).length;
  const acronym = p.name.split(/\s+/).map((w) => w[0]?.toLowerCase() ?? "").join("");
  const acr = acronym.length >= 3 && ` ${ql} `.includes(` ${acronym} `) ? 2 : 0;
  return exact * 2 + fuzzy + acr;
}
async function matchProjects(ctx: TenantContext, texts: string[]): Promise<ProjectListItem[]> {
  const projects = await listProjects(ctx, {});
  for (const raw of texts) {
    const ql = raw.toLowerCase();
    const tokens = ql.split(/\W+/).filter(Boolean);
    const scored = projects
      .map((p) => ({ p, score: scoreProject(p, ql, tokens) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.p.name.length - a.p.name.length);
    if (scored.length) return scored.map((s) => s.p);
  }
  return [];
}
function findPerson(people: WorkloadRow[], q: string): WorkloadRow | null {
  const tokens = q.split(/\W+/).filter(Boolean);
  return (
    people.find((w) => w.name.toLowerCase().split(/\s+/).some((n) => n.length > 2 && (q.includes(n) || fuzzyWord(tokens, n)))) ?? null
  );
}

function detectAspects(q: string): string[] {
  const a: string[] = [];
  if (/what should i do|recommend|next step|action|how (do|can) i fix|what.*do about|advice|suggest/.test(q)) a.push("actions");
  if (/in charge|responsible|\blead\b|owner|\bmanager\b|who.?s? (leading|running|managing)|point of contact/.test(q)) a.push("charge");
  if (/\bteam\b|members|people|who.*(on|working|assigned)|staff|resourc/.test(q)) a.push("team");
  if (/blocker|blocked|impediment/.test(q)) a.push("blockers");
  if (/\brisk/.test(q)) a.push("risks");
  if (/\bwhy\b|reason|cause|behind|slipping|concern|worried|struggl|trouble/.test(q)) a.push("why");
  if (/document|\bbrd\b|\bdoc\b|\bspec\b|requirements? doc|attach/.test(q)) a.push("docs");
  if (/due|deadline|\bwhen\b|timeline|start date|end date|schedule/.test(q)) a.push("timeline");
  if (/\btask|progress|complete|\bdone\b|how far/.test(q)) a.push("tasks");
  if (/commit|github|pull request|\bpr\b|merge|deploy|build/.test(q)) a.push("github");
  if (/status|health|how.*(going|doing)|summary|overview|update|where.*(stand|at)/.test(q)) a.push("status");
  return a.length ? a : ["status"];
}

const tasksOf = (ctx: TenantContext, projectId: string) =>
  withTenant(ctx, (tx) => tx.projectTask.findMany({ where: { projectId }, select: { status: true, dueDate: true } }));

// ── main ─────────────────────────────────────────────────────────────────────
export async function mockChat(
  ctx: TenantContext,
  messages: MockTurn[],
): Promise<{ reply: string; usedAi: boolean; toolsUsed: string[] }> {
  const userMsgs = messages.filter((m) => m.role === "user").map((m) => m.content);
  const question = userMsgs[userMsgs.length - 1] ?? "";
  const q = question.toLowerCase();
  const wrap = (reply: string, toolsUsed: string[]) => ({ reply: reply + NOTE, usedAi: false, toolsUsed });

  // ── Help / greeting ─────────────────────────────────────────────────────────
  if (/^(hi|hey|hello|yo|good (morning|afternoon|evening))\b/.test(q.trim()) || /what can you (do|help|answer)|how do you work|capabilities|what do you know|^help\b/.test(q)) {
    return wrap(
      `I can answer from your live QUBIT data — no guessing. Try:\n` +
        `- "Who is in charge of RBS-24?" / "Who's on it?"\n` +
        `- "Why is RBS-26 at risk?" / "What should I do about it?"\n` +
        `- "What needs my attention today?"\n` +
        `- "What is George working on / blocked on?"\n` +
        `- "Compare RBS-24 and RBS-26"\n` +
        `- "How many open blockers?" / "Who has the most work?"\n` +
        `- "What's due this week?" / "Does RBS-24 have a BRD?"`,
      [],
    );
  }

  const matches = await matchProjects(ctx, [question]);

  // ── Compare two projects ──────────────────────────────────────────────────
  if (/\b(vs|versus|compare|compared to|against|difference)\b/.test(q) && matches.length >= 2) {
    const [a, b] = matches;
    const [pa, pb, ba, bb] = await Promise.all([
      getProjectPanelData(ctx, a.id),
      getProjectPanelData(ctx, b.id),
      listBlockers(ctx, { projectId: a.id }),
      listBlockers(ctx, { projectId: b.id }),
    ]);
    const line = (p: ProjectListItem, panel: Awaited<ReturnType<typeof getProjectPanelData>>, bl: number) =>
      `**${p.name} (${p.code})** — ${p.status}, ${p.avgProgress}% progress, ${bl} open blocker(s)${panel?.dueDate ? `, due ${new Date(panel.dueDate).toLocaleDateString()}` : ""}`;
    return wrap(
      `Comparison\n- ${line(a, pa, ba.filter((x) => x.status === "Open").length)}\n- ${line(b, pb, bb.filter((x) => x.status === "Open").length)}`,
      ["get_project", "list_blockers"],
    );
  }

  // ── Project-scoped (current turn; fall back to earlier turns only if anaphoric) ─
  let proj = matches[0] ?? null;
  if (!proj && (/\b(it|its|it['’]s|that|this|the project|the same|there)\b/.test(q) || /^(and|also|what about|how about|then|ok|okay)\b/.test(q.trim()))) {
    proj = (await matchProjects(ctx, userMsgs.slice(0, -1).reverse()))[0] ?? null;
  }
  if (proj) {
    const label = `${proj.name} (${proj.code})`;
    const aspects = detectAspects(q);
    const [panel, members, blockers, risks, tasks] = await Promise.all([
      getProjectPanelData(ctx, proj.id),
      listProjectMembers(ctx, proj.id),
      listBlockers(ctx, { projectId: proj.id }),
      listRisks(ctx, { projectId: proj.id }),
      tasksOf(ctx, proj.id),
    ]);
    const now = Date.now();
    const openBlk = blockers.filter((b) => b.status === "Open");
    const crit = openBlk.filter((b) => b.severity === "Critical");
    const openRisks = risks.filter((r) => r.status !== "Closed");
    const overdue = tasks.filter((t) => t.dueDate && t.status !== "Completed" && new Date(t.dueDate).getTime() < now).length;
    const done = tasks.filter((t) => t.status === "Completed").length;
    let behind = false;
    if (panel?.startDate && panel?.dueDate) {
      const span = new Date(panel.dueDate).getTime() - new Date(panel.startDate).getTime();
      const elapsed = span > 0 ? Math.round(((now - new Date(panel.startDate).getTime()) / span) * 100) : 0;
      behind = elapsed > 0 && proj.avgProgress < elapsed - 15;
    }
    const tools = new Set<string>(["get_project"]);
    const out: string[] = [];

    for (const a of aspects) {
      if (a === "charge") {
        tools.add("list_members");
        const leaders = members.filter((m) => /lead|manager|sponsor|owner/i.test(m.role));
        const parts = [panel?.leadName ? `**Lead:** ${panel.leadName}` : "", panel?.businessOwner ? `**Business owner:** ${panel.businessOwner}` : "", ...leaders.map((m) => `- ${m.name} — ${m.role}`)].filter(Boolean);
        out.push(`**In charge of ${label}**\n${parts.length ? parts.join("\n") : "_No lead or manager assigned yet._"}`);
      } else if (a === "team") {
        tools.add("list_members");
        out.push(`**Team (${members.length})**\n${members.length ? members.map((m) => `- ${m.name} — ${m.role}${m.allocationPct != null ? ` (${m.allocationPct}%)` : ""}`).join("\n") : "_No one allocated yet._"}`);
      } else if (a === "blockers") {
        tools.add("list_blockers");
        out.push(`**Open blockers (${openBlk.length})**\n${openBlk.length ? openBlk.slice(0, 6).map((b) => `- **${b.severity}:** ${b.description}`).join("\n") : "_None._"}`);
      } else if (a === "risks") {
        tools.add("list_risks");
        out.push(`**Open risks (${openRisks.length})**\n${openRisks.length ? openRisks.slice(0, 6).map((r) => `- ${r.title} — P${r.probability}×I${r.impact}`).join("\n") : "_None._"}`);
      } else if (a === "docs") {
        tools.add("read_documents");
        const docs = await listDocuments(ctx, proj.id);
        out.push(`**Documents (${docs.length})**\n${docs.length ? docs.map((d) => `- ${d.title} — ${d.kind}, ${d.status}`).join("\n") : "_No documents attached._"}`);
      } else if (a === "timeline") {
        out.push(`**Timeline** — start ${panel?.startDate ? new Date(panel.startDate).toLocaleDateString() : "—"}, due ${panel?.dueDate ? new Date(panel.dueDate).toLocaleDateString() : "—"}. ${proj.status}, ${proj.avgProgress}% progress.`);
      } else if (a === "tasks") {
        out.push(`**Tasks** — ${done}/${tasks.length} done (${proj.avgProgress}% progress)${overdue ? `, ${overdue} overdue` : ""}.`);
      } else if (a === "github") {
        tools.add("github_status");
        const g = await getIntegrationSummary(ctx, proj.id, "github");
        out.push(g ? `**GitHub** — ${g.headline}\n${g.lines.map((l) => `- ${l}`).join("\n")}` : "**GitHub** — not connected for this project.");
      } else if (a === "why" || a === "actions") {
        tools.add("list_blockers");
        const over = (await listWorkload(ctx)).filter((w) => w.totalPct > 100 && w.allocations.some((al) => al.projectCode === proj!.code));
        if (a === "why") {
          const reasons = [
            overdue ? `${overdue} overdue task${overdue > 1 ? "s" : ""}` : "",
            openBlk.length ? `${openBlk.length} open blocker${openBlk.length > 1 ? "s" : ""}${crit.length ? ` (${crit.length} critical)` : ""}` : "",
            openRisks.length ? `${openRisks.length} open risk${openRisks.length > 1 ? "s" : ""}` : "",
            behind ? `behind schedule (${proj.avgProgress}% delivered)` : "",
            over.length ? `over-allocated: ${over.map((w) => w.name).join(", ")}` : "",
          ].filter(Boolean);
          out.push(`**Why ${label} needs attention**\n${reasons.length ? reasons.map((r) => `- ${r}`).join("\n") : proj.status === "OnTrack" ? "- On track — no risk signals in the data." : `- Marked ${proj.status}, but nothing specific is logged — confirm with the lead.`}`);
        } else {
          const actions = [
            !panel?.leadName ? "Assign a project lead." : "",
            crit.length ? `Escalate/resolve the critical blocker: ${crit[0].description}.` : openBlk.length ? `Clear the ${openBlk.length} open blocker(s).` : "",
            overdue ? `Re-plan or reassign the ${overdue} overdue task(s).` : "",
            behind ? "Timeline slipping — consider rebaselining or adding capacity." : "",
            over.length ? `Rebalance workload — ${over.map((w) => w.name).join(", ")} over-allocated.` : "",
            openRisks.length ? `Review the ${openRisks.length} open risk(s) and mitigations.` : "",
          ].filter(Boolean);
          out.push(`**Suggested actions for ${label}**\n${actions.length ? actions.map((x) => `- ${x}`).join("\n") : `- Nothing pressing in the data — ${proj.status}, ${proj.avgProgress}% progress.`}`);
        }
      } else {
        out.push([`**${label}** — ${proj.status}, ${proj.avgProgress}% progress.`, panel?.leadName ? `Lead: ${panel.leadName}.` : "", `${members.length} allocated.`, openBlk.length ? `${openBlk.length} open blocker(s).` : "", overdue ? `${overdue} overdue task(s).` : "", panel?.dueDate ? `Due ${new Date(panel.dueDate).toLocaleDateString()}.` : ""].filter(Boolean).join(" "));
      }
    }
    return wrap(out.join("\n\n"), [...tools]);
  }

  // ── Person-scoped (access-gated, §7) ─────────────────────────────────────────
  const allPeople = await listWorkload(ctx);
  const reportable = await reportableUserIds(ctx);
  const people = reportable === "all" ? allPeople : allPeople.filter((p) => reportable.has(p.userId));
  // Refuse another individual's workload if out of scope; offer the team aggregate instead.
  if (reportable !== "all" && /work|allocat|assigned|doing|load|responsible|owns?|busy|block|next|should|priorit|focus/.test(q)) {
    const outOfScope = findPerson(allPeople, q);
    if (outOfScope && !reportable.has(outOfScope.userId)) {
      const over = allPeople.filter((p) => p.totalPct > 100).length;
      return wrap(
        `I can't share **${outOfScope.name}**'s individual workload — that's limited to executives, heads, and whoever manages their projects. Team aggregate: **${allPeople.length}** people, **${over}** over-allocated. Ask a head or exec for an individual view.`,
        ["list_workload"],
      );
    }
  }
  const person = findPerson(people, q);
  if (person && /work|allocat|assigned|doing|load|responsible|owns?|project|busy|block|next|should|priorit|focus/.test(q)) {
    const label = `**${person.name}**`;
    if (/block/.test(q)) {
      const owned = (await listBlockers(ctx, {})).filter((b) => b.ownerId === person.userId && b.status === "Open");
      return wrap(`${label} — blockers they own (${owned.length})\n${owned.length ? owned.map((b) => `- **${b.severity}:** ${b.description}${b.projectCode ? ` (${b.projectCode})` : ""}`).join("\n") : "_None._"}`, ["list_blockers"]);
    }
    if (/which project|what project|projects? (is|are|they)|on what|working on/.test(q)) {
      return wrap(`${label} is on ${person.allocations.length} project(s):\n${person.allocations.map((a) => `- ${a.projectName} — ${a.role}${a.allocationPct != null ? ` (${a.allocationPct}%)` : ""}`).join("\n") || "- None."}`, ["list_workload"]);
    }
    if (/next|should|priorit|focus|to ?do/.test(q)) {
      const [owned, tasks] = await Promise.all([
        listBlockers(ctx, {}).then((bs) => bs.filter((b) => b.ownerId === person.userId && b.status === "Open")),
        withTenant(ctx, (tx) => tx.projectTask.findMany({ where: { assigneeId: person.userId, status: { not: "Completed" } }, select: { title: true, dueDate: true, project: { select: { code: true } } } })),
      ]);
      const now = Date.now();
      const overdue = tasks.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now);
      const items = [
        person.totalPct > 100 ? `You're over-allocated at ${person.totalPct}% — flag capacity.` : "",
        ...overdue.slice(0, 4).map((t) => `Overdue: ${t.title} (${t.project.code})`),
        ...owned.slice(0, 3).map((b) => `Unblock: ${b.description}`),
        ...tasks.filter((t) => !overdue.includes(t)).slice(0, 3).map((t) => `Next: ${t.title} (${t.project.code})`),
      ].filter(Boolean);
      return wrap(`${label} — priorities\n${items.length ? items.map((x) => `- ${x}`).join("\n") : "- Nothing outstanding assigned."}`, ["list_workload", "list_blockers"]);
    }
    return wrap(`${label} — ${person.totalPct}% allocated across ${person.allocations.length} project(s)${person.totalPct > 100 ? " ⚠️ over-allocated" : ""}.\n${person.allocations.map((a) => `- ${a.projectName} — ${a.role}${a.allocationPct != null ? ` (${a.allocationPct}%)` : ""}`).join("\n") || "- Not allocated to any project."}`, ["list_workload"]);
  }

  // ── Time queries (due / overdue across the portfolio) ───────────────────────
  if (/due (this|next)? ?(week|month|soon)?|overdue|what.*due|deadline/.test(q)) {
    const now = Date.now();
    const horizon = /month/.test(q) ? 30 : 7;
    const soon = await withTenant(ctx, (tx) =>
      tx.projectTask.findMany({ where: { status: { not: "Completed" }, dueDate: { not: null } }, select: { title: true, dueDate: true, project: { select: { code: true } } }, orderBy: { dueDate: "asc" }, take: 40 }),
    );
    const overdueOnly = /overdue/.test(q);
    const rows = soon.filter((t) => {
      const d = new Date(t.dueDate!).getTime();
      return overdueOnly ? d < now : d < now + horizon * 86400000;
    });
    return wrap(
      rows.length
        ? `**${overdueOnly ? "Overdue" : `Due within ${horizon} days`} (${rows.length})**\n${rows.slice(0, 12).map((t) => `- ${t.title} (${t.project.code}) — ${new Date(t.dueDate!).toLocaleDateString()}`).join("\n")}`
        : overdueOnly ? "Nothing is overdue." : `Nothing due in the next ${horizon} days.`,
      ["list_tasks"],
    );
  }

  // ── Attention briefing ──────────────────────────────────────────────────────
  if (/attention|today|briefing|focus|prioriti|what should|urgent|fires?|on fire|need.* to know/.test(q)) {
    const projects = await listProjects(ctx, {});
    const attn = projects.filter((p) => p.status === "AtRisk" || p.status === "Overdue");
    const openBlk = (await listBlockers(ctx, {})).filter((b) => b.status === "Open");
    const critB = openBlk.filter((b) => b.severity === "Critical");
    const over = people.filter((w) => w.totalPct > 100);
    return wrap(
      [
        `**What needs attention**`,
        attn.length ? `- ${attn.length} project(s) at risk/overdue: ${attn.map((p) => `${p.code} (${p.status})`).join(", ")}` : "- No projects at risk.",
        critB.length ? `- ${critB.length} critical blocker(s): ${critB.slice(0, 3).map((b) => b.description).join("; ")}` : openBlk.length ? `- ${openBlk.length} open blocker(s)` : "- No open blockers.",
        over.length ? `- Over-allocated: ${over.map((w) => `${w.name} (${w.totalPct}%)`).join(", ")}` : "- No one over-allocated.",
      ].join("\n"),
      ["list_projects", "list_blockers", "list_workload"],
    );
  }

  // ── Counts ──────────────────────────────────────────────────────────────────
  if (/how many|number of|\bcount\b|how much/.test(q)) {
    if (/blocker/.test(q)) return wrap(`There are **${(await listBlockers(ctx, {})).filter((b) => b.status === "Open").length}** open blockers across all projects.`, ["list_blockers"]);
    if (/\brisk/.test(q)) return wrap(`There are **${(await listRisks(ctx, {})).filter((r) => r.status !== "Closed").length}** open risks.`, ["list_risks"]);
    if (/people|person|member|staff|user/.test(q)) return wrap(`There are **${allPeople.length}** people.`, ["list_workload"]);
    return wrap(`There are **${(await listProjects(ctx, {})).length}** projects.`, ["list_projects"]);
  }

  // ── Superlatives ────────────────────────────────────────────────────────────
  if (/most|biggest|highest|worst|busiest|top|least/.test(q)) {
    if (/work|alloc|busy|load/.test(q)) {
      const top = [...people].sort((a, b) => b.totalPct - a.totalPct)[0];
      return wrap(top ? `**${top.name}** has the most work — ${top.totalPct}% across ${top.allocations.length} project(s).` : "No workload data.", ["list_workload"]);
    }
    const projects = await listProjects(ctx, {});
    const rank = (p: ProjectListItem) => ragRank(p.status) * 1000 + (100 - p.avgProgress);
    const worst = [...projects].sort((a, b) => rank(b) - rank(a))[0];
    return wrap(worst ? `**${worst.name} (${worst.code})** looks most at risk — ${worst.status}, ${worst.avgProgress}% progress.` : "No projects.", ["list_projects"]);
  }

  // ── Portfolio-wide intents ──────────────────────────────────────────────────
  if (/over.?alloc|workload|capacity|too (busy|much)|who.*(busy|load)/.test(q)) {
    const over = people.filter((w) => w.totalPct > 100);
    return wrap(over.length ? `**Over-allocated (${over.length})**\n${over.map((w) => `- ${w.name} — ${w.totalPct}%`).join("\n")}` : "No one is over-allocated right now.", ["list_workload"]);
  }
  if (/blocker|blocked|impediment/.test(q)) {
    const open = (await listBlockers(ctx, {})).filter((b) => b.status === "Open");
    return wrap(open.length ? `**Open blockers (${open.length})**\n${open.map((b) => `- **${b.severity}:** ${b.description}${b.projectCode ? ` (${b.projectCode})` : ""}`).join("\n")}` : "No open blockers.", ["list_blockers"]);
  }
  if (/at risk|overdue|slipping|behind|needs attention/.test(q)) {
    const att = (await listProjects(ctx, {})).filter((p) => needsAttention(p.status));
    return wrap(att.length ? `**Needs attention (${att.length})**\n${att.map((p) => `- ${p.name} (${p.code}) — ${p.status}, ${p.avgProgress}%`).join("\n")}` : "Nothing is at risk or overdue.", ["list_projects"]);
  }
  if (/\brisk/.test(q)) {
    const open = (await listRisks(ctx, {})).filter((r) => r.status !== "Closed");
    return wrap(open.length ? `**Open risks (${open.length})**\n${open.map((r) => `- ${r.title} — P${r.probability}×I${r.impact}${r.projectCode ? ` (${r.projectCode})` : ""}`).join("\n")}` : "No open risks.", ["list_risks"]);
  }
  if (/commit|github|pull request|\bpr\b|merge/.test(q)) {
    return wrap("Ask about a specific project (by name or code) to see its connected GitHub signals — e.g. “last commit on RBS-26”.", ["github_status"]);
  }

  // ── Fallback: portfolio snapshot + a nudge toward what Q can answer ──────────
  const projects = await listProjects(ctx, {});
  const by = (s: string) => projects.filter((p) => p.status === s).length;
  return wrap(
    `**Portfolio:** ${projects.length} projects — ${by("OnTrack")} on track, ${by("AtRisk")} at risk, ${by("Overdue")} overdue, ${by("Planning")} planning.\n_Ask about a project, a person, "what needs attention", or say "help" for more._`,
    ["list_projects"],
  );
}
