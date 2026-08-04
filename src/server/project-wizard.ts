// M-P1c (docs/27 §2, docs/26 §5.3) — the project wizard's create. ONE transaction:
// project + team (with role hats, allocations, windows) + market org-statuses +
// checkpoint template link + optional BRD + optional YouTrack connection all land
// together or not at all (docs/27 §1.6). Capacity warnings the PM accepted are recorded
// in the audit blob — informed overrides, never silent ones.
import { z } from "zod";
import { audit } from "@/lib/audit";
import { flagEnabled } from "@/lib/flags";
import { PROJECT_ROLES } from "@/lib/roles";
import { encryptSecret } from "@/lib/secret-box";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { emitDomainEvent } from "@/server/events";
import { nextFreeCode, projectCodeBase, ProjectError } from "@/server/projects";

const TeamRow = z.object({
  userId: z.string().uuid(),
  role: z.enum(PROJECT_ROLES),
  allocationPct: z.number().int().min(1).max(100),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export const CreateProjectWizardInput = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,10}$/, "Code must be 2–10 letters/digits.")
    .optional(),
  description: z.string().trim().max(500).optional(),
  portfolioId: z.string().uuid({ message: "Every project belongs to a portfolio." }),
  // docs/27 §5 gap 2 (28-p1b §3): the stage may be chosen at create — Approved projects
  // exist on day one when the business case predates QUBIT. Paused is NOT offered:
  // creating a paused project is a contradiction.
  pipelineStage: z.enum(["Exploring", "Evaluating", "Approved"]).default("Exploring"),
  programmeId: z.string().uuid().nullable().optional(),
  // CheckpointTemplate ids are CUIDs (M-D-A models default cuid(), not uuid()) — the
  // real integrity check is the RLS-scoped findUniqueOrThrow in the engine.
  checkpointTemplateId: z.string().min(1).max(40).nullable().optional(),
  marketIds: z.array(z.string().uuid()).max(20).default([]),
  team: z.array(TeamRow).max(20).default([]),
  document: z
    .object({
      title: z.string().trim().min(1).max(160),
      kind: z.enum(["BRD", "URS", "SRS", "Plan", "Other"]),
      format: z.enum(["text", "markdown", "pdf"]),
      content: z.string().max(200_000).optional(),
      // ~2 MB of pdf as base64. Bigger belongs in the register after create.
      fileData: z.string().max(3_000_000).optional(),
    })
    .optional(),
  youtrack: z
    .object({
      baseUrl: z.string().url(),
      projectKey: z.string().trim().min(1).max(30),
      token: z.string().min(1).max(500),
    })
    .optional(),
  /** Capacity/leave warnings shown AND accepted on the Team step — audited verbatim. */
  acceptedWarnings: z.array(z.string().max(200)).max(20).default([]),
});
export type CreateProjectWizardInputT = z.infer<typeof CreateProjectWizardInput>;

export async function createProjectFromWizard(ctx: TenantContext, input: CreateProjectWizardInputT) {
  if (input.youtrack && !flagEnabled("youtrack")) {
    throw new ProjectError("YouTrack integration is disabled on this deployment.", "YT_DISABLED");
  }
  // Same unique-code race retry as createProject (two same-named projects at once).
  for (let attempt = 0; ; attempt++) {
    try {
      return await createOnce(ctx, input);
    } catch (e) {
      const race =
        !input.code && attempt < 2 && typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
      if (!race) throw e;
    }
  }
}

async function createOnce(ctx: TenantContext, input: CreateProjectWizardInputT) {
  return withTenant(ctx, async (tx) => {
    // ── Validate every reference under RLS before writing anything.
    await tx.portfolio.findUniqueOrThrow({ where: { id: input.portfolioId } }).catch(() => {
      throw new ProjectError("Portfolio not found.", "PORTFOLIO_NOT_FOUND");
    });
    if (input.programmeId) {
      const pg = await tx.programme.findUnique({
        where: { id: input.programmeId },
        select: { portfolioId: true },
      });
      if (!pg) throw new ProjectError("Programme not found.", "PROGRAMME_NOT_FOUND");
      if (pg.portfolioId !== input.portfolioId) {
        throw new ProjectError("Programme belongs to a different portfolio.", "PROGRAMME_MISMATCH");
      }
    }
    if (input.checkpointTemplateId) {
      await tx.checkpointTemplate.findUniqueOrThrow({ where: { id: input.checkpointTemplateId } }).catch(() => {
        throw new ProjectError("Checkpoint template not found.", "TEMPLATE_NOT_FOUND");
      });
    }
    if (input.marketIds.length) {
      const found = await tx.orgUnit.count({ where: { id: { in: input.marketIds }, kind: "Market" } });
      if (found !== input.marketIds.length) {
        throw new ProjectError("One or more markets are not valid market org units.", "BAD_MARKET");
      }
    }
    const userIds = [...new Set(input.team.map((t) => t.userId))];
    if (userIds.length !== input.team.length) {
      throw new ProjectError("A person can only appear once on the team.", "DUPLICATE_MEMBER");
    }
    if (userIds.length) {
      const found = await tx.user.count({ where: { id: { in: userIds }, status: { not: "DELETED" } } });
      if (found !== userIds.length) throw new ProjectError("Unknown team member.", "MEMBER_NOT_FOUND");
    }
    for (const t of input.team) {
      if (t.startDate && t.endDate && new Date(t.startDate) > new Date(t.endDate)) {
        throw new ProjectError("An assignment window cannot end before it starts.", "BAD_WINDOW");
      }
    }

    const code = input.code ?? (await nextFreeCode(tx, projectCodeBase(input.name)));
    // The first Project Manager hat is the project's lead — every project should have
    // one so join requests and escalations route somewhere (DM1.21 rule, kept).
    const leadUserId = input.team.find((t) => t.role === "Project Manager")?.userId ?? null;

    const project = await tx.project.create({
      data: {
        tenantId: ctx.tenantId,
        code,
        name: input.name,
        description: input.description ?? null,
        type: "Project",
        priority: "Med",
        status: "Planning",
        portfolioId: input.portfolioId,
        programmeId: input.programmeId ?? null,
        checkpointTemplateId: input.checkpointTemplateId ?? null,
        pipelineStage: input.pipelineStage,
        leadUserId,
      },
    });

    for (const t of input.team) {
      await tx.projectMember.create({
        data: {
          tenantId: ctx.tenantId,
          projectId: project.id,
          userId: t.userId,
          role: t.role,
          allocationPct: t.allocationPct,
          startDate: t.startDate ? new Date(t.startDate) : null,
          endDate: t.endDate ? new Date(t.endDate) : null,
        },
      });
    }
    for (const orgUnitId of input.marketIds) {
      // A market track starts untouched: 0% in Planning; the rollout flow moves it.
      await tx.projectOrgStatus.create({
        data: { tenantId: ctx.tenantId, projectId: project.id, orgUnitId, progress: 0, status: "Planning" },
      });
    }
    if (input.document) {
      if (!input.document.content && !input.document.fileData) {
        throw new ProjectError("An attached document needs content or a file.", "EMPTY_DOCUMENT");
      }
      await tx.projectDocument.create({
        data: {
          tenantId: ctx.tenantId,
          projectId: project.id,
          title: input.document.title,
          kind: input.document.kind,
          format: input.document.format,
          content: input.document.content ?? null,
          fileData: input.document.fileData ?? null,
          createdById: ctx.userId,
        },
      });
    }
    if (input.youtrack) {
      await tx.projectIntegration.create({
        data: {
          tenantId: ctx.tenantId,
          projectId: project.id,
          provider: "youtrack",
          connected: true,
          resource: input.youtrack.projectKey,
          secret: encryptSecret(input.youtrack.token),
          config: { baseUrl: input.youtrack.baseUrl },
        },
      });
    }

    await audit(tx, ctx, {
      action: "create",
      entityType: "project",
      entityId: project.id,
      after: {
        code: project.code,
        name: project.name,
        portfolioId: input.portfolioId,
        programmeId: input.programmeId ?? null,
        checkpointTemplateId: input.checkpointTemplateId ?? null,
        markets: input.marketIds.length,
        team: input.team.map((t) => ({ userId: t.userId, role: t.role, allocationPct: t.allocationPct })),
        document: input.document ? { title: input.document.title, kind: input.document.kind } : null,
        youtrack: input.youtrack ? { projectKey: input.youtrack.projectKey } : null, // never the token
        acceptedWarnings: input.acceptedWarnings,
      },
    });
    await emitDomainEvent(tx, ctx, {
      type: "project.created",
      entityType: "project",
      entityId: project.id,
      payload: { code: project.code, name: project.name },
      notify: leadUserId && leadUserId !== ctx.userId
        ? [{ userId: leadUserId, kind: "project.created", message: `You lead the new project ${project.name} (${project.code}).`, link: `/projects/${project.id}` }]
        : [],
    });

    return project;
  });
}
