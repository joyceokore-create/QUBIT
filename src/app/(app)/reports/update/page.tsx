import { auth } from "@/lib/auth";
import { isValidIsoWeek, isoWeekId } from "@/lib/iso-week";
import { getStatusWorkspace } from "@/server/status-report-upload";
import { getTenantTimeZone } from "@/server/preferences";
import { StatusWorkspace } from "@/components/reports/status-workspace";

/**
 * Reports › Weekly Update — the weekly update workspace: one card per project the viewer
 * runs, prefilled from QUBIT, every gate, channel state, market check-in and line editable
 * in place; a status report file (the Upload drawer) only prefills it. Each card saves a
 * draft or confirms and sends its line; Confirm & Send All sends every ready card.
 * ?upload=1 (the walkthrough's door) opens the Upload drawer.
 */
export const dynamic = "force-dynamic";

export default async function UpdateAllPage({ searchParams }: { searchParams: Promise<{ week?: string; upload?: string }> }) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  const sp = await searchParams;
  const currentWeek = isoWeekId(new Date());
  const week = sp.week && isValidIsoWeek(sp.week) && sp.week <= currentWeek ? sp.week : currentWeek;
  const [initial, timeZone] = await Promise.all([getStatusWorkspace(ctx, week), getTenantTimeZone(ctx)]);
  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 p-[22px_24px_90px]">
      <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
        <StatusWorkspace initial={initial} uploadHint={sp.upload === "1"} timeZone={timeZone} tenantName={session.user.tenantName ?? ""} />
      </div>
    </main>
  );
}
