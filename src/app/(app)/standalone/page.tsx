import { Breadcrumb } from "@/components/layout/breadcrumb";
import { ComingSoon } from "@/components/coming-soon";

export default function StandalonePage() {
  return (
    <div className="flex flex-1 flex-col gap-[22px] p-[26px]">
      <Breadcrumb items={[{ label: "Group Overview", href: "/dashboard" }, { label: "Standalone Items" }]} />
      <ComingSoon
        title="Standalone Items"
        description="Independent projects and programmes with no portfolio lands with the portfolio & project drill-down milestone."
        milestone={5}
      />
    </div>
  );
}
