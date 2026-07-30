import { getMailer } from "@/server/mail/mailer";
import { digestEmail } from "@/server/mail/template";
import { resolveChannels } from "@/server/mail/preferences";
import type { JobDefinition } from "@/server/jobs/types";

/**
 * The daily digest (docs/16 §8 — digest-first). One email per person holding everything
 * that arrived since their last digest, rather than one email per event.
 *
 * Idempotent by construction: only notifications with `emailedAt = null` are collected,
 * and they are stamped as part of the same run. A re-delivered cron hit therefore sends
 * nothing twice, and a mail failure leaves the stamp unset so the next run retries.
 */
export const dailyDigest: JobDefinition = {
  name: "daily-digest",
  async run(tx, tenant) {
    const pending = await tx.notification.findMany({
      where: { emailedAt: null, readAt: null },
      select: { id: true, userId: true, kind: true, message: true, link: true },
      orderBy: { createdAt: "asc" },
    });
    if (!pending.length) return { sent: 0, skipped: 0, reason: "nothing pending" };

    const channels = await resolveChannels(
      tx,
      pending.map((n) => ({ userId: n.userId, kind: n.kind })),
    );
    // InApp-only notifications never leave the bell; Digest and Email both belong in the
    // batch here (Email kinds are also sent at emit time — this is the safety net for
    // anything that missed, and the stamp stops a double send).
    const mailable = pending.filter((n) => channels.get(`${n.userId}:${n.kind}`) !== "InApp");
    if (!mailable.length) {
      // Still stamp the in-app-only ones so they are not reconsidered every night.
      await tx.notification.updateMany({ where: { id: { in: pending.map((n) => n.id) } }, data: { emailedAt: new Date() } });
      return { sent: 0, skipped: pending.length, reason: "all in-app only" };
    }

    const byUser = new Map<string, typeof mailable>();
    for (const n of mailable) {
      const list = byUser.get(n.userId) ?? [];
      list.push(n);
      byUser.set(n.userId, list);
    }

    // The job's tenant handle carries id/slug only; branding comes from the row so the
    // email reads green for KCB and red for Riverbank, exactly like the app.
    const brand = await tx.tenant.findUnique({ where: { id: tenant.id }, select: { name: true, brandColor: true } });
    const users = await tx.user.findMany({
      where: { id: { in: [...byUser.keys()] }, status: "ACTIVE" },
      select: { id: true, name: true, email: true },
    });
    const mailer = getMailer();
    const appUrl = process.env.AUTH_URL ?? "";

    let sent = 0;
    let failed = 0;
    const deliveredIds: string[] = [];
    for (const user of users) {
      const items = byUser.get(user.id) ?? [];
      const email = digestEmail({
        tenantName: brand?.name ?? tenant.slug,
        brandColor: brand?.brandColor ?? "#231F20",
        firstName: (user.name ?? "there").split(/\s+/)[0],
        items: items.map((i) => ({ message: i.message, link: i.link })),
        appUrl,
      });
      const result = await mailer.send({ to: user.email, ...email });
      if (result.ok) {
        sent++;
        deliveredIds.push(...items.map((i) => i.id));
      } else {
        // Leave emailedAt unset so tomorrow's run tries again — a bounced digest is not
        // a delivered one.
        failed++;
      }
    }

    // In-app-only rows are stamped too: they were considered and deliberately not sent.
    const inAppOnlyIds = pending.filter((n) => channels.get(`${n.userId}:${n.kind}`) === "InApp").map((n) => n.id);
    const stampIds = [...deliveredIds, ...inAppOnlyIds];
    if (stampIds.length) {
      await tx.notification.updateMany({ where: { id: { in: stampIds } }, data: { emailedAt: new Date() } });
    }

    return { sent, failed, notifications: deliveredIds.length, inAppOnly: inAppOnlyIds.length };
  },
};
