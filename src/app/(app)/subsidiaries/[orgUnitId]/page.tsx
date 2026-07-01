import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { withTenant } from "@/lib/tenant";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { ComingSoon } from "@/components/coming-soon";

export default async function SubsidiaryPage({
  params,
}: {
  params: Promise<{ orgUnitId: string }>;
}) {
  const { orgUnitId } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const orgUnit = await withTenant(
    { tenantId: session.user.tenantId, userId: session.user.id },
    (tx) => tx.orgUnit.findUnique({ where: { id: orgUnitId }, select: { name: true, flag: true } }),
  );
  if (!orgUnit) notFound();

  return (
    <div className="flex flex-1 flex-col gap-[22px] p-[26px]">
      <Breadcrumb items={[{ label: "Group Overview", href: "/dashboard" }, { label: orgUnit.name }]} />
      <ComingSoon
        title={`${orgUnit.flag ? orgUnit.flag + " " : ""}${orgUnit.name}`}
        description="The subsidiary project table, filters, and KPI strip land with the subsidiary view milestone."
        milestone={6}
      />
    </div>
  );
}
