import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { withTenant } from "@/lib/tenant";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { ComingSoon } from "@/components/coming-soon";

export default async function PortfolioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const portfolio = await withTenant(
    { tenantId: session.user.tenantId, userId: session.user.id },
    (tx) => tx.portfolio.findUnique({ where: { id }, select: { name: true } }),
  );
  if (!portfolio) notFound();

  return (
    <div className="flex flex-1 flex-col gap-[22px] p-[26px]">
      <Breadcrumb items={[{ label: "Group Overview", href: "/dashboard" }, { label: portfolio.name }]} />
      <ComingSoon
        title={portfolio.name}
        description="Portfolio detail — programmes, projects, and drill-down panels — lands with the portfolio & project drill-down milestone."
        milestone={5}
      />
    </div>
  );
}
