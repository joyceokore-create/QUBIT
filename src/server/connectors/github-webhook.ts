import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withTenant } from "@/lib/tenant";
import { decryptSecret } from "@/lib/secret-box";
import { commitTitle, parseCommitMessage } from "@/server/connectors/github-commit-grammar";
import { TaskError, flagTaskBlocked, updateTask } from "@/server/project-tasks";

/**
 * GitHub push-webhook processing (docs/15 §6.3). The route is a thin shell; everything
 * testable lives here.
 *
 * Trust rules, in order:
 *  - The signature is verified over the RAW bytes with the integration's own secret
 *    (per-project, encrypted at rest). Finding that secret requires reading
 *    repository.full_name out of the payload first — that read is pure data extraction;
 *    NOTHING is acted on until the HMAC has passed.
 *  - Tenant routing comes from OUR stored `resource`, never from the payload: the repo
 *    name is only ever used as a lookup key against what an admin configured. A forged
 *    payload naming tenant B's repo authenticates (or fails) against tenant B's secret
 *    alone — it cannot steer writes anywhere else.
 *  - Replays are claimed via WebhookDelivery (GitHub redelivers on timeouts) — same
 *    idempotency shape as JobRun.
 *  - Transitions go through the existing engine (`updateTask` / `flagTaskBlocked`) so
 *    audit, lastActivityAt and notifications fire exactly like a human move. The actor
 *    is the tenant user whose email matches the commit author, else the `github-sync`
 *    sentinel. Illegal moves (Completed task, YouTrack-mirrored task) are IGNORED and
 *    counted, never errored back to GitHub — it would only retry.
 */

export const MAX_BODY_BYTES = 1_000_000; // §6.3 №6

// ── Signature ────────────────────────────────────────────────────────────────────────

/** Verify X-Hub-Signature-256 ("sha256=<hex>") over the raw body. Timing-safe. */
export function verifyGithubSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const provided = header.slice("sha256=".length).trim().toLowerCase();
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
}

// ── Payload (the slice we read; everything optional — payloads are untrusted) ────────

export interface PushCommit {
  id?: string;
  message?: string;
  url?: string;
  timestamp?: string;
  author?: { name?: string; email?: string };
}
export interface PushPayload {
  repository?: { full_name?: string };
  commits?: PushCommit[];
}

// ── Integration resolution ───────────────────────────────────────────────────────────

export interface ResolvedIntegration {
  tenantId: string;
  projectId: string;
  /** Decrypted webhook secret — the thing the signature is checked against. */
  webhookSecret: string;
}

/**
 * Find the ONE connected GitHub integration whose stored resource matches the repo name.
 * Cross-tenant by necessity (a webhook carries no session), so it loops tenants the way
 * the job runner does — each lookup still runs under that tenant's RLS context.
 */
export async function resolveGithubIntegration(fullName: string): Promise<ResolvedIntegration | null> {
  const repo = fullName.trim().toLowerCase();
  if (!repo) return null;
  const tenants = await prisma.tenant.findMany({ select: { id: true }, orderBy: { slug: "asc" } });
  for (const tenant of tenants) {
    const row = await withTenant({ tenantId: tenant.id, userId: "github-sync" }, async (tx) => {
      // Matched in code: Prisma string equality is case-sensitive, GitHub repo names
      // aren't, and the candidate set (connected GitHub integrations per tenant) is tiny.
      const candidates = await tx.projectIntegration.findMany({
        where: { provider: "github", connected: true, webhookSecret: { not: null } },
        select: { projectId: true, resource: true, webhookSecret: true },
        orderBy: { updatedAt: "desc" },
      });
      return candidates.find((r) => (r.resource ?? "").trim().toLowerCase() === repo) ?? null;
    });
    if (row?.webhookSecret) {
      try {
        return { tenantId: tenant.id, projectId: row.projectId, webhookSecret: decryptSecret(row.webhookSecret) };
      } catch {
        return null; // undecryptable secret: treat as not configured, never as verified
      }
    }
  }
  return null;
}

// ── Processing ───────────────────────────────────────────────────────────────────────

export interface PushResult {
  replay: boolean;
  linked: number;
  moved: number;
  blocked: number;
  /** Directives that could not apply (unknown key, illegal transition, mirrored task). */
  ignored: number;
}

const TARGET: Record<string, "InProgress" | "InReview"> = { progress: "InProgress", done: "InReview" };

export async function processPush(
  resolved: Pick<ResolvedIntegration, "tenantId" | "projectId">,
  payload: PushPayload,
  deliveryId: string,
): Promise<PushResult> {
  const sysCtx = { tenantId: resolved.tenantId, userId: "github-sync", roles: [] as string[] };
  const result: PushResult = { replay: false, linked: 0, moved: 0, blocked: 0, ignored: 0 };

  // Claim the delivery id first — a replayed delivery must be a recorded no-op.
  try {
    await withTenant(sysCtx, (tx) =>
      tx.webhookDelivery.create({
        data: { tenantId: resolved.tenantId, provider: "github", deliveryId },
      }),
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ...result, replay: true };
    }
    throw err;
  }

  const commits = (payload.commits ?? []).filter((c): c is PushCommit & { id: string } => !!c.id);
  if (!commits.length) return result;

  // One pass to collect keys + author emails, then two lookups instead of N.
  const parsed = commits.map((c) => ({ commit: c, directives: parseCommitMessage(c.message ?? "") }));
  const keys = [...new Set(parsed.flatMap((p) => p.directives.map((d) => d.key)))];
  if (!keys.length) return result;
  const emails = [
    ...new Set(commits.map((c) => c.author?.email?.trim().toLowerCase()).filter((e): e is string => !!e)),
  ];

  const { taskByKey, userByEmail } = await withTenant(sysCtx, async (tx) => {
    const tasks = await tx.projectTask.findMany({
      // Keys resolve ONLY within the integration's own project — a commit can never
      // reach across projects, let alone tenants. Both key spaces match: QUBIT taskKeys
      // ("P001-12") and, on YouTrack-connected projects, the tracker's externalKey
      // ("RBC-123") — mirrored tasks carry no taskKey (DM1.42), and devs reference the
      // key they actually work with. Mirrored matches LINK only; transitions are
      // YouTrack's to make.
      where: {
        projectId: resolved.projectId,
        OR: [{ taskKey: { in: keys } }, { externalKey: { in: keys }, sourceSystem: { not: null } }],
      },
      select: { id: true, taskKey: true, externalKey: true, status: true, sourceSystem: true },
    });
    const users = emails.length
      ? await tx.user.findMany({
          where: { email: { in: emails, mode: "insensitive" }, status: "ACTIVE" },
          select: { id: true, email: true },
        })
      : [];
    const byKey = new Map<string, (typeof tasks)[number]>();
    for (const t of tasks) {
      if (t.taskKey) byKey.set(t.taskKey.toUpperCase(), t);
      if (t.sourceSystem && t.externalKey) byKey.set(t.externalKey.toUpperCase(), t);
    }
    return {
      taskByKey: byKey,
      userByEmail: new Map(users.map((u) => [u.email.toLowerCase(), u.id])),
    };
  });

  for (const { commit, directives } of parsed) {
    const authorId = userByEmail.get(commit.author?.email?.trim().toLowerCase() ?? "") ?? null;
    // Matched committer becomes the actor, so audit rows carry the human who pushed.
    const actorCtx = { tenantId: resolved.tenantId, userId: authorId ?? "github-sync", roles: [] as string[] };

    for (const directive of directives) {
      const task = taskByKey.get(directive.key);
      if (!task) {
        result.ignored++; // unknown key — someone referenced a ticket that isn't ours
        continue;
      }

      // Every directive links the commit, whatever else happens (idempotent on sha).
      const created = await withTenant(sysCtx, (tx) =>
        tx.taskCommitLink
          .upsert({
            where: { taskId_sha: { taskId: task.id, sha: commit.id } },
            create: {
              tenantId: resolved.tenantId,
              taskId: task.id,
              sha: commit.id,
              url: commit.url ?? null,
              message: commitTitle(commit.message ?? ""),
              authorName: commit.author?.name?.slice(0, 200) ?? null,
              authorUserId: authorId,
              committedAt: commit.timestamp ? new Date(commit.timestamp) : null,
            },
            update: {},
            select: { createdAt: true },
          })
          .then((r) => Date.now() - r.createdAt.getTime() < 5_000),
      );
      if (created) result.linked++;

      try {
        if (directive.action === "blocked") {
          await flagTaskBlocked(actorCtx, task.id, {
            description: directive.reason ?? `Blocked via commit ${commit.id.slice(0, 7)}`,
            ownerId: authorId, // null when unmatched — a sentinel can't own a Blocker
          });
          result.blocked++;
        } else if (directive.action === "progress" || directive.action === "done") {
          const target = TARGET[directive.action];
          // Illegal transitions are ignored, never errors back to GitHub (§6.3):
          // already there, already Completed (QA's call, not a commit's), or mirrored
          // from YouTrack (the tracker owns status — updateTask would refuse anyway).
          if (task.status === target || task.status === "Completed" || task.sourceSystem) {
            result.ignored++;
          } else {
            await updateTask(actorCtx, task.id, { status: target });
            task.status = target; // keep local view current for a later commit in the same push
            result.moved++;
          }
        }
      } catch (e) {
        if (e instanceof TaskError) {
          result.ignored++; // e.g. a race with a concurrent human move — never a 5xx
        } else {
          throw e;
        }
      }
    }
  }
  return result;
}
