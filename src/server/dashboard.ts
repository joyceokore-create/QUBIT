import { withTenant, type TenantContext } from "@/lib/tenant";
import { projectRag, ragCounts } from "@/server/health";

// ── Derived-value helpers (docs/09-ui-spec.md "Derived values") ──────────────
// These mirror docs/design-reference-exec-dashboard.html's own helpers (avgPct, sc(),
// ragCountsForList) exactly, so the numbers this milestone produces match the reference.
// RAG classification lives in src/server/health.ts (M0 — one health engine).

export type RagStatus = "OnTrack" | "AtRisk" | "Overdue" | "Planning";

interface OrgStatus {
  orgUnitId: string;
  progress: number;
  status: string;
}

export interface ProjectWithStatus {
  id: string;
  code: string;
  name: string;
  type: string;
  priority: string;
  status: string;
  dueDate: Date | null;
  budget: string | null;
  portfolioId: string | null;
  programmeId: string | null;
  orgStatuses: OrgStatus[];
}

/**
 * A project's overall progress. Since M-D-A there are two sources, in priority order
 * (docs/18 §2 — % is derived, never typed):
 *   1. checkpoint states, when the project has a checkpoint template attached;
 *   2. otherwise the average of its subsidiaries' ProjectOrgStatus progress.
 * Callers that can supply checkpoint figures pass them in `checkpointProgress` — see
 * checkpointProgressByProject(). Everything else keeps the legacy rollup, so a project
 * without gates still reads honestly instead of dropping to 0%.
 */
export function avgProgress(
  project: { id?: string; orgStatuses: { progress: number }[] },
  checkpointProgress?: Map<string, number>,
): number {
  if (project.id && checkpointProgress?.has(project.id)) return checkpointProgress.get(project.id)!;
  if (project.orgStatuses.length === 0) return 0;
  const sum = project.orgStatuses.reduce((acc, s) => acc + s.progress, 0);
  return Math.round(sum / project.orgStatuses.length);
}

/** Parses display-string budgets like "KES 2.8B" / "KES 830M" into a number of KES.
 * Phase A budgets are display strings, not a real money type (docs/05-data-model.md) —
 * this is a best-effort sum for the dashboard KPI, not a financial calculation. */
export function parseBudget(budget: string | null | undefined): number {
  if (!budget) return 0;
  const match = budget.match(/([\d,.]+)\s*([MB])/i);
  if (!match) return 0;
  const num = parseFloat(match[1].replace(/,/g, ""));
  const multiplier = match[2].toUpperCase() === "B" ? 1_000_000_000 : 1_000_000;
  return num * multiplier;
}

export function formatBudget(amount: number): string {
  if (amount >= 1_000_000_000) return `KES ${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `KES ${Math.round(amount / 1_000_000)}M`;
  return `KES ${Math.round(amount).toLocaleString()}`;
}

// ── Data access ────────────────────────────────────────────────────────────

async function getProjectsWithStatus(ctx: TenantContext): Promise<ProjectWithStatus[]> {
  return withTenant(ctx, (tx) =>
    tx.project.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        priority: true,
        status: true,
        dueDate: true,
        budget: true,
        portfolioId: true,
        programmeId: true,
        orgStatuses: { select: { orgUnitId: true, progress: true, status: true } },
      },
    }),
  );
}

export interface DashboardSummary {
  totalItems: number;
  portfolioCount: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
  totalBudget: string;
}

export async function getDashboardSummary(ctx: TenantContext): Promise<DashboardSummary> {
  const [projects, portfolios] = await Promise.all([
    getProjectsWithStatus(ctx),
    withTenant(ctx, (tx) => tx.portfolio.findMany({ select: { targetBudget: true } })),
  ]);

  const { onTrack, atRisk, overdue } = ragCounts(projects);
  const totalBudget = portfolios.reduce((sum, p) => sum + parseBudget(p.targetBudget), 0);

  return {
    totalItems: projects.length,
    portfolioCount: portfolios.length,
    onTrack,
    atRisk,
    overdue,
    totalBudget: formatBudget(totalBudget),
  };
}

// The portfolio × subsidiary heatmap that lived here left with the amended docs/18 §6:
// its signal is the per-section RAG+Δ on the dashboard's portfolio sections (DM1.30),
// and the rollout heatmap returns per-portfolio with M-D's market tracks.

export interface PortfolioCardData {
  id: string;
  name: string;
  category: string; // Approved | Exploring | Shelved (M-P1b)
  viewKind: string;
  budget: string | null;
  itemCount: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
  avgProgress: number;
  orgUnits: { code: string; flag: string | null }[];
}

export async function getPortfolioCards(ctx: TenantContext): Promise<PortfolioCardData[]> {
  const [projects, portfolios, orgUnits] = await Promise.all([
    getProjectsWithStatus(ctx),
    withTenant(ctx, (tx) => tx.portfolio.findMany({ orderBy: { name: "asc" } })),
    withTenant(ctx, (tx) => tx.orgUnit.findMany({ select: { id: true, code: true, flag: true } })),
  ]);
  const orgUnitById = new Map(orgUnits.map((o) => [o.id, o]));

  return portfolios.map((portfolio) => {
    const items = projects.filter((p) => p.portfolioId === portfolio.id);
    const { onTrack, atRisk, overdue } = ragCounts(items);
    const avg = items.length
      ? Math.round(items.reduce((sum, p) => sum + avgProgress(p), 0) / items.length)
      : 0;
    const orgUnitIds = new Set(items.flatMap((p) => p.orgStatuses.map((os) => os.orgUnitId)));

    return {
      id: portfolio.id,
      name: portfolio.name,
      category: portfolio.category,
      viewKind: portfolio.viewKind,
      budget: portfolio.targetBudget,
      itemCount: items.length,
      onTrack,
      atRisk,
      overdue,
      avgProgress: avg,
      orgUnits: [...orgUnitIds]
        .map((id) => orgUnitById.get(id))
        .filter((o): o is { id: string; code: string; flag: string | null } => !!o)
        .map((o) => ({ code: o.code, flag: o.flag })),
    };
  });
}

// Type kept for the portfolios page's programme-less grid; the /standalone surface and
// its query died with docs/18 §0.5 (every project belongs to a portfolio).
export interface StandaloneCardData {
  id: string;
  code: string;
  name: string;
  type: string;
  priority: string;
  status: string;
  budget: string | null;
  avgProgress: number;
  orgUnits: { code: string; flag: string | null }[];
}

export interface EscalationItem {
  id: string;
  kind: "Risk" | "Issue";
  title: string;
  meta: string;
  color: "red" | "amber";
}

const SEVERITY_COLOR: Record<string, "red" | "amber"> = {
  Critical: "red",
  High: "amber",
  Medium: "amber",
  Low: "amber",
};

export async function getEscalations(ctx: TenantContext, limit = 8): Promise<EscalationItem[]> {
  const [risks, issues] = await Promise.all([
    withTenant(ctx, (tx) =>
      tx.risk.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          project: { select: { code: true } },
        },
      }),
    ),
    withTenant(ctx, (tx) =>
      tx.issue.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
          createdAt: true,
          project: { select: { code: true } },
        },
      }),
    ),
  ]);

  const combined: (EscalationItem & { createdAt: Date })[] = [
    ...risks
      .filter((r) => r.status !== "Closed" && r.status !== "Mitigated")
      .map((r) => ({
        id: r.id,
        kind: "Risk" as const,
        title: r.title,
        meta: [r.project?.code, "Risk", relativeAge(r.createdAt)].filter(Boolean).join(" · "),
        color: "red" as const,
        createdAt: r.createdAt,
      })),
    ...issues
      .filter((i) => i.status !== "Closed")
      .map((i) => ({
        id: i.id,
        kind: "Issue" as const,
        title: i.title,
        meta: [i.project?.code, "Issue", relativeAge(i.createdAt)].filter(Boolean).join(" · "),
        color: SEVERITY_COLOR[i.severity] ?? "amber",
        createdAt: i.createdAt,
      })),
  ];

  return combined
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .map(({ createdAt: _createdAt, ...rest }) => rest);
}

export interface UpcomingMilestone {
  id: string;
  text: string;
  meta: string;
  color: "green" | "amber" | "red";
}

export async function getUpcomingMilestones(
  ctx: TenantContext,
  limit = 8,
): Promise<UpcomingMilestone[]> {
  // ProjectMilestone since the M1 merge — subsidiary context lives in the name.
  // "Late" is derived: still Pending with a past due date.
  const now = new Date();
  const milestones = await withTenant(ctx, (tx) =>
    tx.projectMilestone.findMany({
      where: { dueDate: { not: null }, status: { not: "Done" } },
      orderBy: { dueDate: "asc" },
      take: limit,
      select: {
        id: true,
        name: true,
        dueDate: true,
        project: { select: { name: true, status: true } },
      },
    }),
  );

  return milestones
    .filter((m) => m.dueDate)
    .map((m) => {
      const rag = projectRag(m.project.status);
      const color: "green" | "amber" | "red" =
        m.dueDate! < now || rag === "Red" ? "red" : rag === "Amber" ? "amber" : "green";
      const label = color === "red" ? "Overdue" : color === "amber" ? "At risk" : "On track";

      return {
        id: m.id,
        text: `${m.project.name} — ${m.name}`.replace(/\s+/g, " ").trim(),
        meta: `${formatShortDate(m.dueDate!)} · ${label}`,
        color,
      };
    });
}

function relativeAge(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
