import Link from "next/link";
import { cn } from "@/lib/utils";
import type { HeatmapData } from "@/server/dashboard";
import { EmptyState } from "@/components/dashboard/empty-state";

const CELL_CLASSES: Record<string, string> = {
  OnTrack: "bg-status-green-bg border-[#86EFAC]",
  AtRisk: "bg-amber-bg border-[#FCD34D]",
  Overdue: "bg-status-red-bg border-[#FCA5A5]",
};
const TEXT_CLASSES: Record<string, string> = {
  OnTrack: "text-status-green",
  AtRisk: "text-amber",
  Overdue: "text-status-red",
};
const LABEL: Record<string, string> = {
  OnTrack: "On Track",
  AtRisk: "At Risk",
  Overdue: "Overdue",
};

export function HealthHeatmap({ data }: { data: HeatmapData }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-foreground">
            Portfolio × Subsidiary Health Map
          </div>
          <div className="text-[11px] text-ink-3">
            Click a cell to filter · Click a portfolio name to drill in
          </div>
        </div>
        <div className="text-[11px] text-ink-3">
          <span className="text-status-green">■</span> On Track{" "}
          <span className="text-amber">■</span> At Risk{" "}
          <span className="text-status-red">■</span> Overdue
        </div>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState message="No portfolios yet — create one to see the health map." />
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-ink-4 bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="w-[210px] border-b border-ink-4 bg-background px-[13px] py-[9px] text-left text-[10px] font-semibold tracking-[0.7px] text-ink-3 uppercase">
                  Portfolio
                </th>
                {data.orgUnits.map((ou) => (
                  <th
                    key={ou.id}
                    className="border-b border-ink-4 bg-background px-[13px] py-[9px] text-left text-[10px] font-semibold tracking-[0.7px] whitespace-nowrap text-ink-3 uppercase"
                  >
                    {ou.flag} {ou.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.portfolioId} className="border-b border-background last:border-b-0">
                  <td className="border-r border-ink-4 p-[14px] align-middle">
                    <Link
                      href={`/portfolios/${row.portfolioId}`}
                      className="text-[12px] font-semibold text-foreground hover:text-brand hover:underline"
                    >
                      {row.portfolioName}
                    </Link>
                    <div className="mt-0.5 text-[10px] text-ink-3">{row.itemCount} items</div>
                  </td>
                  {row.cells.map((cell, i) => {
                    const orgUnit = data.orgUnits[i];
                    return (
                      <td
                        key={orgUnit.id}
                        className="border-r border-background p-[7px_9px] last:border-r-0"
                      >
                        {cell ? (
                          <Link
                            href={`/portfolios/${row.portfolioId}?sub=${orgUnit.id}`}
                            className={cn(
                              "block rounded-[7px] border px-[10px] py-2",
                              CELL_CLASSES[cell.status],
                            )}
                          >
                            <div
                              className={cn(
                                "text-[15px] leading-none font-bold tracking-[-0.4px]",
                                TEXT_CLASSES[cell.status],
                              )}
                            >
                              {cell.pct}%
                            </div>
                            <div className="mt-0.5 text-[9px] text-ink-3">
                              {cell.count} item{cell.count > 1 ? "s" : ""}
                            </div>
                            <div
                              className={cn(
                                "mt-[3px] text-[9px] font-semibold tracking-[0.4px] uppercase",
                                TEXT_CLASSES[cell.status],
                              )}
                            >
                              {LABEL[cell.status]}
                            </div>
                          </Link>
                        ) : (
                          <div className="rounded-[7px] border border-dashed border-ink-4 bg-background px-[10px] py-2 text-center text-[11px] text-ink-4">
                            —
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
