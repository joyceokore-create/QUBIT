import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { isValidIsoWeek, isoWeekId } from "@/lib/iso-week";
import { getStatusWorkspace } from "@/server/status-report-upload";
import { StatusWorkspace } from "@/components/reports/status-workspace";

/**
 * Reports › Update all my projects — the weekly update workspace: one card per project the
 * viewer runs, prefilled from QUBIT, every gate, channel state, market check-in and line
 * editable in place; a status report file only prefills it. Lines drafted here are sent
 * from the queue (Reports › This week). ?upload=1 (the walkthrough's door) spotlights the
 * file button.
 */
export const dynamic = "force-dynamic";

export default async function UpdateAllPage({ searchParams }: { searchParams: Promise<{ week?: string; upload?: string }> }) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  const sp = await searchParams;
  const currentWeek = isoWeekId(new Date());
  const week = sp.week && isValidIsoWeek(sp.week) && sp.week <= currentWeek ? sp.week : currentWeek;
  const initial = await getStatusWorkspace(ctx, week);
  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 p-[22px_24px_90px]">
      <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
        <Link href="/reports" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)]">
          <ArrowLeft className="size-3.5" aria-hidden /> Reports
        </Link>
        <h1 className="mt-1 font-heading text-[26px] rv:text-heading-lg font-bold tracking-[-.7px] text-[var(--qink)]">Update all my projects</h1>
        <p className="mt-1 max-w-[720px] text-[13.5px] text-[var(--ink3)] [text-wrap:pretty]">
          Every project you run, as QUBIT has it now. Set each gate, each channel state per market, each market&apos;s check-in and the line for the Head, then
          apply once. A status report can prefill the cards. Lines go to the Head only when you send them from the queue.
        </p>
      </div>
      <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.06s_both]">
        <StatusWorkspace initial={initial} uploadHint={sp.upload === "1"} />
      </div>
    </main>
  );
}
