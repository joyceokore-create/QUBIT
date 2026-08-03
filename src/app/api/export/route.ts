import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { csvFilename, toCsv, type CsvColumn } from "@/lib/csv";
import { taskVisibleTo } from "@/lib/board-lens";
import { viewerBoardCategory } from "@/server/board-scope";
import { getPortfolioSections, type PipelineRow } from "@/server/pipeline";
import type { PipelineStage } from "@/server/projects";
import { listProjectTasks, type ProjectTaskRow } from "@/server/project-tasks";
import { listRisks, type RiskListItem } from "@/server/risks";
import { listWorkload, type WorkloadRow } from "@/server/resources";

// GET /api/export?kind=projects|tasks|risks|allocations (docs/16 §9, M9). ONE route so
// the CSV rules live in one place; each kind reuses the EXACT engine its screen renders
// from — the file you download is the table you were looking at, including its
// permission scope (tasks go through the DM1.43 board wall, not around it).
// Time already exports at /api/time/report?format=csv (same toCsv since M9).

export const dynamic = "force-dynamic";

type FlatPipelineRow = PipelineRow & { portfolio: string; stage: PipelineStage };

const PROJECT_COLS: CsvColumn<FlatPipelineRow>[] = [
  { header: "Code", value: (r) => r.code },
  { header: "Project", value: (r) => r.name },
  { header: "Portfolio", value: (r) => r.portfolio },
  { header: "Stage", value: (r) => r.stage },
  { header: "Health", value: (r) => r.chips.health },
  { header: "Progress %", value: (r) => r.progress },
  { header: "Priority", value: (r) => r.priority },
  { header: "Open blockers", value: (r) => r.openBlockers },
  { header: "Open risks", value: (r) => r.chips.risksOpen },
  { header: "Milestones overdue", value: (r) => r.chips.milestonesOverdue },
  { header: "Members", value: (r) => r.chips.resources },
  { header: "Status note", value: (r) => r.note },
];

const TASK_COLS: CsvColumn<ProjectTaskRow>[] = [
  { header: "Key", value: (r) => r.taskKey ?? r.externalKey },
  { header: "Title", value: (r) => r.title },
  { header: "Type", value: (r) => r.type },
  { header: "Status", value: (r) => r.status },
  { header: "Priority", value: (r) => r.priority },
  { header: "Severity", value: (r) => r.severity },
  { header: "Assignee", value: (r) => r.assigneeName ?? r.externalAssigneeName },
  { header: "Lane", value: (r) => r.assigneeCategory },
  { header: "Due", value: (r) => r.dueDate },
  { header: "Blocked", value: (r) => r.blocked },
  { header: "Waiting on", value: (r) => r.waitingOn.join("; ") },
  { header: "Commits", value: (r) => r.commitCount },
  { header: "Source", value: (r) => r.sourceSystem ?? "qubit" },
  { header: "Last activity", value: (r) => r.lastActivityAt },
];

const RISK_COLS: CsvColumn<RiskListItem>[] = [
  { header: "Title", value: (r) => r.title },
  { header: "Project", value: (r) => r.projectCode },
  { header: "Category", value: (r) => r.category },
  { header: "Probability", value: (r) => r.probability },
  { header: "Impact", value: (r) => r.impact },
  { header: "Score", value: (r) => r.probability * r.impact },
  { header: "Status", value: (r) => r.status },
  { header: "Materialised", value: (r) => r.materialised },
  { header: "Owner", value: (r) => r.ownerName },
  { header: "Mitigation", value: (r) => r.mitigation },
  { header: "Raised", value: (r) => r.createdAt },
];

const ALLOCATION_COLS: CsvColumn<WorkloadRow>[] = [
  { header: "Name", value: (r) => r.name },
  { header: "Email", value: (r) => r.email },
  { header: "Department", value: (r) => r.departmentName },
  { header: "Projects", value: (r) => r.projectCount },
  { header: "Allocated %", value: (r) => r.totalPct },
  { header: "Effective % (leave-aware)", value: (r) => r.effectivePct },
  { header: "On leave until", value: (r) => r.onLeaveUntil },
  { header: "Allocations", value: (r) => r.allocations.map((a) => `${a.projectCode} ${a.role} ${a.allocationPct ?? "—"}%`).join("; ") },
];

function respond(csv: string, stem: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(stem)}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");

  switch (kind) {
    case "projects": {
      const guard = await requirePermission("project:read");
      if ("response" in guard) return guard.response;
      const data = await getPortfolioSections(guard.ctx);
      const rows: FlatPipelineRow[] = data.sections.flatMap((s) =>
        s.pipeline.groups.flatMap((g) => g.rows.map((r) => ({ ...r, portfolio: s.name, stage: g.stage }))),
      );
      return respond(toCsv(rows, PROJECT_COLS), "projects");
    }
    case "tasks": {
      const guard = await requirePermission("project:read");
      if ("response" in guard) return guard.response;
      const projectId = url.searchParams.get("projectId");
      if (!projectId) {
        return NextResponse.json({ error: { code: "VALIDATION", message: "projectId is required." } }, { status: 400 });
      }
      const [tasks, category] = await Promise.all([
        listProjectTasks(guard.ctx, projectId),
        viewerBoardCategory(guard.ctx, projectId),
      ]);
      // DM1.43 holds in the file exactly as on the screen.
      const visible = tasks.filter((t) => taskVisibleTo(category, guard.ctx.userId, t));
      return respond(toCsv(visible, TASK_COLS), "tasks");
    }
    case "risks": {
      const guard = await requirePermission("risk:read");
      if ("response" in guard) return guard.response;
      const projectId = url.searchParams.get("projectId") ?? undefined;
      const status = url.searchParams.get("status") ?? undefined;
      const rows = await listRisks(guard.ctx, { projectId, status });
      return respond(toCsv(rows, RISK_COLS), "risks");
    }
    case "allocations": {
      const guard = await requirePermission("project:read"); // same gate as /people
      if ("response" in guard) return guard.response;
      const rows = await listWorkload(guard.ctx);
      return respond(toCsv(rows, ALLOCATION_COLS), "allocations");
    }
    default:
      return NextResponse.json(
        { error: { code: "VALIDATION", message: "kind must be projects | tasks | risks | allocations." } },
        { status: 400 },
      );
  }
}
