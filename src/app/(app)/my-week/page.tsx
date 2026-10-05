import { auth } from "@/lib/auth";
import { getMyWeek } from "@/server/my-week";
import { MyWeekQueue } from "@/components/my-week/my-week-queue";

// "My week" (docs/38 rethink) — the cross-project weekly ritual: confirm every project
// you run from one queue. Confirming is the status update; sending forwards it to the
// Head. The per-project workspace is the drill-down for anything needing real editing.
export default async function MyWeekPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };

  const { isoWeek, scope, rows } = await getMyWeek(ctx);
  const week = isoWeek.replace("-W", " · week ");
  const done = rows.filter((r) => r.confirmed && r.sentToHead).length;

  return (
    <main className="mx-auto flex w-full max-w-[900px] flex-col gap-4 p-[26px]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-[21px] rv:text-heading-md font-bold tracking-[-0.5px] text-foreground">My week</h1>
          <p className="mt-[3px] text-xs rv:text-body-sm text-ink-3">
            {rows.length
              ? `${done} of ${rows.length} reported · ${week}. Review each draft, adjust the status, confirm.`
              : `Nothing to report · ${week}.`}
          </p>
        </div>
      </header>
      <MyWeekQueue rows={rows} scope={scope} />
    </main>
  );
}
