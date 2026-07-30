import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";

/**
 * Notification routing (docs/16 §8). THE DEFAULT MATRIX LIVES HERE, in code, and a
 * database row exists only when somebody changed their mind. That way the default can
 * evolve for everyone without a migration, and "what happens if I do nothing" has one
 * answer rather than one per user.
 *
 * Digest-first: the only kinds that mail immediately are the ones where a day's delay
 * defeats the purpose.
 */

export const CHANNELS = ["InApp", "Digest", "Email"] as const;
export type Channel = (typeof CHANNELS)[number];

/** kind → default channel. "*" is the catch-all for anything not named. */
export const DEFAULT_CHANNELS: Record<string, Channel> = {
  "*": "Digest",
  // Time-critical: a nudge that arrives tomorrow has already failed.
  nudge: "Email",
  // The weekly report has its own send at publish time; the bell covers the rest.
  weekly_report: "Email",
  // Chatter belongs in the app — emailing every mention is how people mute a tool.
  comment_mention: "Digest",
  task_update: "Digest",
  // Purely informational; the bell is enough.
  checkin_ready: "InApp",
};

export function defaultChannelFor(kind: string): Channel {
  return DEFAULT_CHANNELS[kind] ?? DEFAULT_CHANNELS["*"];
}

/** Resolve each (userId, kind) → channel, applying overrides over the default matrix. */
export async function resolveChannels(
  tx: Prisma.TransactionClient,
  pairs: { userId: string; kind: string }[],
): Promise<Map<string, Channel>> {
  const out = new Map<string, Channel>();
  if (!pairs.length) return out;
  const userIds = [...new Set(pairs.map((p) => p.userId))];
  const prefs = await tx.notificationPreference.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, kind: true, channel: true },
  });
  const exact = new Map(prefs.map((p) => [`${p.userId}:${p.kind}`, p.channel as Channel]));
  for (const p of pairs) {
    const key = `${p.userId}:${p.kind}`;
    out.set(
      key,
      // Most specific wins: this kind → their catch-all → the code default.
      exact.get(key) ?? exact.get(`${p.userId}:*`) ?? defaultChannelFor(p.kind),
    );
  }
  return out;
}

export interface PreferenceRow {
  kind: string;
  channel: Channel;
  /** True when this row is the code default rather than the user's own choice. */
  isDefault: boolean;
}

/** The viewer's effective matrix — defaults shown alongside anything they changed. */
export async function listMyPreferences(ctx: TenantContext): Promise<PreferenceRow[]> {
  return withTenant(ctx, async (tx) => {
    const mine = await tx.notificationPreference.findMany({
      where: { userId: ctx.userId },
      select: { kind: true, channel: true },
    });
    const byKind = new Map(mine.map((m) => [m.kind, m.channel as Channel]));
    return Object.keys(DEFAULT_CHANNELS).map((kind) => ({
      kind,
      channel: byKind.get(kind) ?? defaultChannelFor(kind),
      isDefault: !byKind.has(kind),
    }));
  });
}

export const SetPreferenceInput = z.object({
  kind: z.string().trim().min(1).max(60),
  channel: z.enum(CHANNELS),
});

/** Change my routing for one kind. Audited — it changes who hears about what. */
export async function setMyPreference(
  ctx: TenantContext,
  input: z.infer<typeof SetPreferenceInput>,
): Promise<PreferenceRow[]> {
  await withTenant(ctx, async (tx) => {
    await tx.notificationPreference.upsert({
      where: { tenantId_userId_kind: { tenantId: ctx.tenantId, userId: ctx.userId, kind: input.kind } },
      create: { tenantId: ctx.tenantId, userId: ctx.userId, kind: input.kind, channel: input.channel },
      update: { channel: input.channel },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "notification_preference",
      entityId: `${ctx.userId}:${input.kind}`,
      after: { kind: input.kind, channel: input.channel },
    });
  });
  return listMyPreferences(ctx);
}
