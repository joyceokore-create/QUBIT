import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { getSubsidiaryDetail } from "@/server/subsidiaries";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SubsidiaryProjectTable } from "@/components/subsidiaries/subsidiary-project-table";
import { cn } from "@/lib/utils";

function HeaderStat({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className={cn("text-xl leading-none font-bold tracking-[-0.8px] text-foreground", className)}>
        {value}
      </div>
      <div className="text-[9px] font-semibold tracking-[0.6px] text-ink-3 uppercase">{label}</div>
    </div>
  );
}

export default async function SubsidiaryPage({
  params,
}: {
  params: Promise<{ orgUnitId: string }>;
}) {
  const { orgUnitId } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
  const subsidiary = await getSubsidiaryDetail(ctx, orgUnitId);
  if (!subsidiary) notFound();

  return (
    <div className="flex flex-1 flex-col gap-[22px] p-[26px]">
      <Breadcrumb
        items={[{ label: "Group Overview", href: "/dashboard" }, { label: subsidiary.name }]}
      />

      <div className="rounded-[10px] border border-ink-4 bg-card p-[20px_22px]">
        <div className="mb-4 font-heading text-lg font-bold tracking-[-0.3px] text-foreground">
          {subsidiary.flag ? `${subsidiary.flag} ` : ""}
          {subsidiary.name}
        </div>
        <div className="flex flex-wrap gap-6">
          <HeaderStat label="Total Items" value={subsidiary.totalItems} />
          <HeaderStat label="On Track" value={subsidiary.onTrack} className="text-status-green" />
          <HeaderStat label="At Risk" value={subsidiary.atRisk} className="text-amber" />
          <HeaderStat label="Overdue" value={subsidiary.overdue} className="text-status-red" />
        </div>
      </div>

      {subsidiary.projects.length > 0 ? (
        <SubsidiaryProjectTable currentOrgUnitCode={subsidiary.code} projects={subsidiary.projects} />
      ) : (
        <EmptyState message="No projects reporting into this subsidiary yet." />
      )}
    </div>
  );
}
