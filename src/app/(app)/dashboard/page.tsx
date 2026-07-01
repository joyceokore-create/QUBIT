import { Download, RotateCw } from "lucide-react";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ComingSoon } from "@/components/coming-soon";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <div className="flex flex-1 flex-col gap-[22px] p-[26px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-[3px] text-[10px] font-semibold tracking-[1px] text-brand uppercase">
            Executive Overview
          </div>
          <h1 className="font-heading text-[21px] font-bold tracking-[-0.5px] text-foreground">
            {session.user.tenantName} — Project &amp; Programme Portfolio
          </h1>
          <p className="mt-[3px] text-xs text-ink-3">
            Signed in as {session.user.name} · {session.user.roles.join(", ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" disabled title="Coming in Milestone 4">
            <Download /> Export PPT
          </Button>
          <Button size="sm" disabled title="Coming in Milestone 4">
            <RotateCw /> Refresh
          </Button>
        </div>
      </div>

      <ComingSoon
        title="Group Overview dashboard"
        description="The KPI strip, portfolio × subsidiary health map, portfolio and standalone grids, and the escalations/milestones feeds land with the Group Overview dashboard milestone."
        milestone={4}
      />
    </div>
  );
}
