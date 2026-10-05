import { auth } from "@/lib/auth";
import { getMyWeek } from "@/server/my-week";
import { MyWeekQueue } from "@/components/my-week/my-week-queue";
import { WeekCockpit } from "@/components/my-week/week-cockpit";

// "My week" (docs/38 rethink) — the cross-project weekly ritual: confirm every project
// you run from one queue. Confirming is the status update; sending forwards it to the
// Head. The cockpit header shows the shape of the week at a glance; the queue is where
// the work happens. The per-project workspace stays the drill-down for real editing.
export default async function MyWeekPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };

  const { isoWeek, scope, rows } = await getMyWeek(ctx);

  return (
    <main className="mx-auto flex w-full max-w-[940px] flex-col gap-4 p-[26px_24px_80px]">
      <WeekCockpit isoWeek={isoWeek} scope={scope} rows={rows} />
      <MyWeekQueue rows={rows} scope={scope} />
    </main>
  );
}
