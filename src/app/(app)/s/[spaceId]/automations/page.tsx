import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getTenantContext, forTenant } from "@/server/tenant-db";
import { listStatusGroupsForSpace } from "@/server/statuses";
import { listAutomations } from "@/server/automations";
import { AutomationsManager } from "@/components/clickup/automations-manager";

// /s/{spaceId}/automations — space-level automation rules (04-module-specs §9).
export default async function AutomationsPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const ctx = await getTenantContext();

  const space = await forTenant(ctx, (tx) => tx.space.findUnique({ where: { id: spaceId }, select: { name: true, icon: true } }));
  if (!space) notFound();

  const [groups, automations] = await Promise.all([
    listStatusGroupsForSpace(ctx, spaceId),
    listAutomations(ctx, "SPACE", spaceId),
  ]);
  const statuses = (groups[0]?.statuses ?? []).map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 p-6">
      <div className="flex items-center gap-1.5 text-[12px] text-[var(--ink4)]">
        <Link href={`/s/${spaceId}`} className="flex items-center gap-1.5 hover:text-[var(--qink)]">
          <span>{space.icon ?? "🗂️"}</span>
          {space.name}
        </Link>
        <ChevronRight className="size-3" />
        <span className="font-semibold text-[var(--qink)]">Automations</span>
      </div>

      <h1 className="text-[21px] font-bold tracking-[-.4px] text-[var(--qink)]">Automations</h1>
      <p className="-mt-2 text-[12px] text-[var(--ink4)]">
        Rules run when tasks in this space change — e.g. move a task to Done and auto-clear its
        priority. Actions can re-trigger rules; a loop guard stops runaway chains.
      </p>

      <AutomationsManager
        spaceId={spaceId}
        statuses={statuses}
        automations={automations.map((a) => ({
          id: a.id,
          name: a.name,
          active: a.active,
          runCount: a.runCount,
          trigger: a.trigger as { type: string; params?: { to?: string[] } },
          actions: a.actions as { type: string; params: Record<string, string> }[],
        }))}
      />
    </div>
  );
}
