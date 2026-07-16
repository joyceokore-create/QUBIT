import { getTenantContext } from "@/server/tenant-db";
import { timeReport } from "@/server/time";

// /time — this week's time report for the current user (04-module-specs §13).
function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export default async function TimePage() {
  const ctx = await getTenantContext();
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
  const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
  const { rows, totalMin } = await timeReport(ctx, { from: monday, to: nextMonday, userId: ctx.userId });

  const csvHref = `/api/v1/time/report?from=${monday.toISOString()}&to=${nextMonday.toISOString()}&userId=${ctx.userId}&format=csv`;

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 p-6">
      <div>
        <div className="text-[10.5px] font-bold uppercase tracking-[2px] text-brand">Time</div>
        <h1 className="text-[21px] font-bold tracking-[-.4px] text-[var(--qink)]">This week</h1>
        <p className="mt-1 text-[12px] text-[var(--ink4)]">
          {monday.toLocaleDateString()} – {new Date(nextMonday.getTime() - 86400000).toLocaleDateString()} ·{" "}
          <span className="font-semibold text-[var(--qink)]">{fmtMin(totalMin)}</span> tracked
        </p>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-[var(--w07)] bg-[var(--qcard)]">
        <div className="flex items-center justify-between border-b border-[var(--w07)] px-3 py-2">
          <span className="text-[11px] font-bold uppercase tracking-[1px] text-[var(--ink4)]">
            {rows.length} {rows.length === 1 ? "task" : "tasks"}
          </span>
          <a href={csvHref} className="text-[12px] font-semibold text-[var(--ink3)] hover:text-brand">
            Export CSV
          </a>
        </div>
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.taskId} className="border-b border-[var(--w05)]">
                <td className="px-3 py-2 text-[var(--qink)]">{r.taskName}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-[var(--ink5)]">QBT-{r.taskSeq}</td>
                <td className="px-3 py-2 text-right text-[var(--ink2)]">{fmtMin(r.totalMin)}</td>
                <td className="px-3 py-2 text-right text-[12px] text-[var(--ok)]">
                  {r.billableMin ? `${fmtMin(r.billableMin)} billable` : ""}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-8 text-center text-[12px] text-[var(--ink5)]">
                  No time tracked this week. Start a timer from any task.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
