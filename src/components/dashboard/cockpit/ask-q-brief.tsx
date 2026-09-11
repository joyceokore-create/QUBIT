import type { CockpitData } from "@/server/dashboard-cockpit";
import type { DashboardLevel } from "@/lib/dashboard-level";

// The reference's "Ask Q" brief — 2–3 plain-English insight lines per level, DERIVED from the
// same cockpit data the panels below render (status updates, gates, RAID). Not an LLM call:
// deterministic highlights so the brief can never disagree with the numbers beneath it.

interface Line { emphasis: string; detail: string }

function briefLines(level: DashboardLevel, data: CockpitData, viewerId: string): Line[] {
  const active = data.projects.filter((p) => !["Completed", "Cancelled"].includes(p.status));
  const disputes = active.filter((p) => p.dispute);
  const stale = active.filter((p) => p.freshnessDays > 14 && p.freshnessDays < 900);
  const red = active.filter((p) => p.calculated === "R");
  const lines: Line[] = [];

  if (level === "pm" || level === "user") {
    const mine = active.filter((p) => p.pmId === viewerId);
    const pool = mine.length ? mine : active;
    const overdue = pool.filter((p) => p.nextMilestone?.overdue);
    if (overdue[0]) lines.push({ emphasis: `${overdue[0].name} has a milestone overdue.`, detail: "Re-baseline or record why it slipped before the weekly report." });
    if (pool.find((p) => p.dispute)) { const d = pool.find((p) => p.dispute)!; lines.push({ emphasis: `${d.name} is reported ${d.reported} but calculates ${d.calculated}.`, detail: "Revise the rating or add justification." }); }
    const rr = pool.find((p) => p.redRisks > 0);
    if (rr) lines.push({ emphasis: `${rr.name} has an open red risk.`, detail: rr.risks.find((r) => r.severity === "R")?.title ?? "Escalate to your Head." });
  } else if (level === "head") {
    if (disputes.length) lines.push({ emphasis: `${disputes.length} project${disputes.length > 1 ? "s are" : " is"} reported greener than they calculate.`, detail: `${disputes.map((p) => p.name).slice(0, 3).join(", ")}${disputes.length > 3 ? "…" : ""} — the sandbagging pattern to check.` });
    if (stale.length) lines.push({ emphasis: `${stale.length} status update${stale.length > 1 ? "s are" : " is"} older than 14 days.`, detail: `Chase ${stale.slice(0, 2).map((p) => p.name).join(" and ")}.` });
    if (red.length) lines.push({ emphasis: `${red.length} project${red.length > 1 ? "s calculate" : " calculates"} Red.`, detail: "Decide what to escalate upward this week." });
  } else {
    // exec / superadmin
    const approved = active.filter((p) => p.category === "Approved");
    const live = data.projects.filter((p) => p.status === "Completed").length;
    if (live) lines.push({ emphasis: `${live} solution${live > 1 ? "s are" : " is"} live in production.`, detail: "Delivery momentum is real across the approved portfolio." });
    if (red.length) lines.push({ emphasis: `${red.length} approved initiative${red.length > 1 ? "s are" : " is"} at risk.`, detail: `${red.slice(0, 3).map((p) => p.name).join(", ")} need a Group decision.` });
    if (disputes.length) lines.push({ emphasis: `Reported RAG hides ${disputes.length} amber/red project${disputes.length > 1 ? "s" : ""}.`, detail: "Calculated health has drifted from what PMs report." });
    if (!lines.length && approved.length) lines.push({ emphasis: "The approved portfolio is executing.", detail: "No red-flag decisions outstanding this week." });
  }

  if (!lines.length) lines.push({ emphasis: "Nothing needs your attention right now.", detail: "No overdue gates, disputes or red risks in view." });
  return lines.slice(0, 3);
}

export function AskQBrief({ level, data, viewerId }: { level: DashboardLevel; data: CockpitData; viewerId: string }) {
  const lines = briefLines(level, data, viewerId);
  const when = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <section className="grid grid-cols-[auto_1fr] gap-3.5 rounded-[12px] border border-[var(--cardbd)] p-4" style={{ background: "var(--cardbg)" }}>
      <div className="grid size-[34px] place-items-center rounded-[9px] bg-[var(--qink)] text-[15px] font-bold text-[var(--bg)]">Q</div>
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink4)]">Ask Q · brief · generated {when} today</div>
        {lines.map((l, i) => (
          <p key={i} className="mb-1.5 max-w-[90ch] text-[13px] text-[var(--ink2)]"><b className="font-semibold text-[var(--qink)]">{l.emphasis}</b> {l.detail}</p>
        ))}
        <div className="text-[11px] text-[var(--ink4)]">Derived from status updates, gate records and RAID — verify before acting.</div>
      </div>
    </section>
  );
}
