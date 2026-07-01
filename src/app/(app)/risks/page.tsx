import { Breadcrumb } from "@/components/layout/breadcrumb";
import { ComingSoon } from "@/components/coming-soon";

export default function RisksPage() {
  return (
    <div className="flex flex-1 flex-col gap-[22px] p-[26px]">
      <Breadcrumb items={[{ label: "Group Overview", href: "/dashboard" }, { label: "Risks & Issues" }]} />
      <ComingSoon
        title="Risks & Issues"
        description="Risk register, issue tracking, and the post-implementation-review gap report land with the RAID milestone."
        milestone={7}
      />
    </div>
  );
}
