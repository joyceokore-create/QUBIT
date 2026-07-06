import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeverityPill } from "@/components/raid/severity-pill";
import type { GapReportSummary } from "@/server/raid";

const GAP_REASON_LABEL: Record<string, string> = {
  no_origin_risk: "No prior risk was tracked",
  risk_unowned_or_unmitigated: "Origin risk had no owner or mitigation",
};

export function GapReportView({ report }: { report: GapReportSummary }) {
  if (report.totalIssues === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[10px] border border-ink-4 bg-white p-16 text-center">
        <h2 className="font-heading text-lg text-foreground">No issues recorded yet</h2>
        <p className="max-w-sm text-sm text-ink-2">
          The gap report will populate once issues exist — materialise a risk or raise one
          directly to see post-implementation review coverage here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-[6px] bg-background p-[12px_14px]">
          <div className="mb-1 text-[9px] font-bold tracking-[0.7px] text-ink-3 uppercase">Total Issues</div>
          <div className="text-[21px] font-bold tracking-[-0.8px] text-foreground">{report.totalIssues}</div>
        </div>
        <div className="rounded-[6px] bg-background p-[12px_14px]">
          <div className="mb-1 text-[9px] font-bold tracking-[0.7px] text-ink-3 uppercase">Traced to a Risk</div>
          <div className="text-[21px] font-bold tracking-[-0.8px] text-status-green">{report.traced}</div>
        </div>
        <div className="rounded-[6px] bg-background p-[12px_14px]">
          <div className="mb-1 text-[9px] font-bold tracking-[0.7px] text-ink-3 uppercase">Gaps</div>
          <div className="text-[21px] font-bold tracking-[-0.8px] text-status-red">{report.gapCount}</div>
        </div>
      </div>

      {report.gapCount === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[10px] border border-ink-4 bg-white p-16 text-center">
          <h2 className="font-heading text-lg text-foreground">No gaps</h2>
          <p className="max-w-sm text-sm text-ink-2">
            Every issue traces back to an owned, mitigated risk.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-ink-4 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Issue</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Origin Risk</TableHead>
                <TableHead>Gap Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.items.map((item) => (
                <TableRow key={item.issueId}>
                  <TableCell className="font-medium">{item.issueTitle}</TableCell>
                  <TableCell className="text-ink-2">{item.projectCode ?? "—"}</TableCell>
                  <TableCell>
                    <SeverityPill severity={item.severity} />
                  </TableCell>
                  <TableCell className="text-ink-3">{item.originRiskTitle ?? "None"}</TableCell>
                  <TableCell className="text-[11px] text-status-red">
                    {GAP_REASON_LABEL[item.gapReason] ?? item.gapReason}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
