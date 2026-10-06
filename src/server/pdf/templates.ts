import { CARD, DIGEST_MARGIN, EYEBROW, dimPrint, esc, flowFooter, flowingDocument, header, list, pagedDocument, ragPrint, ragTile, sectionTitle } from "@/server/pdf/shell";
import { shortDate, type DigestReportData, type GateCell, type NextStep, type ProjectReportData, type TableReportData } from "@/server/pdf/report-data";
import type { ReportCell } from "@/server/custom-reports";
import type { RenderPdfOptions } from "@/server/pdf/render";

/**
 * Milestone D — the four print templates (handoff §5, `Redesign - Report Export.dc.html`):
 * Build one-pager, In-market one-pager, Build + In-market (two columns) and the Portfolio
 * digest. Pure functions of their read model → a self-contained HTML string plus the
 * print spec the renderer needs. Every string that came from a person goes through esc().
 */

export interface RenderedReport {
  html: string;
  spec: RenderPdfOptions;
  filenameStem: string;
}

const GATE_BAR: Record<GateCell["state"], string> = { Done: "#16a34a", InProgress: "#2563eb", Blocked: "#dc2626", NotStarted: "#dadada" };
const GATE_FG: Record<GateCell["state"], string> = { Done: "#0d622c", InProgress: "#1d4ed8", Blocked: "#a61419", NotStarted: "#6b6b6b" };

const stem = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "report";

function longDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function gateStrip(gates: GateCell[], compact = false): string {
  if (gates.length === 0) return `<p style="color:#9f9f9f;font-style:italic">No gate template on this project.</p>`;
  const cols = Math.min(gates.length, 8);
  return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px">${gates
    .slice(0, 8)
    .map(
      (g, i) =>
        `<div style="border-top:4px solid ${GATE_BAR[g.state]};padding-top:${compact ? 6 : 8}px;min-width:0"><div style="font-size:10px;font-weight:700;color:${GATE_FG[g.state]}">${i + 1} · ${esc(g.label.toUpperCase())}</div><div style="font-weight:600;margin-top:2px;font-size:${compact ? 10.5 : 12}px;color:${g.state === "NotStarted" ? "#6b6b6b" : "#231f20"}">${esc(g.name)}</div>${
          g.note && !compact ? `<div style="font-size:10.5px;color:#6b6b6b;margin-top:1px">${esc(g.note)}</div>` : ""
        }</div>`,
    )
    .join("")}</div>${gates.length > 8 ? `<p style="margin-top:4px;font-size:10px;color:#9f9f9f">+${gates.length - 8} more gates</p>` : ""}`;
}

function nextSteps(steps: NextStep[]): string {
  if (steps.length === 0) return `<p style="color:#9f9f9f;font-style:italic">Nothing due in the next two weeks.</p>`;
  return `<ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;line-height:1.4;color:#2b2b2b">${steps
    .map((s) => `<li>${esc(s.title)}<br><span style="font-size:10.5px;color:#6b6b6b">${[s.owner ? `Owner ${esc(s.owner)}` : null, s.due ? `Due ${shortDate(s.due)}` : null].filter(Boolean).join(" · ") || "Unassigned"}</span></li>`)
    .join("")}</ul>`;
}

function decisionCard(d: ProjectReportData["decision"], compact = false): string {
  return `<div style="border-radius:10px;background:#231f20;color:#fff;padding:${compact ? 11 : 12}px 14px"><div style="${EYEBROW};color:#f8a4a7">Needs a decision</div>${
    d
      ? `<div style="font-weight:700;margin-top:4px;font-size:13px">${esc(d.description)}</div><div style="font-size:11px;color:#c8c7c7;margin-top:4px;line-height:1.45">${[d.owner ? `Owner ${esc(d.owner)}` : "No owner", `Open ${d.ageDays} day${d.ageDays === 1 ? "" : "s"}`, d.severity === "Critical" ? "Critical" : null].filter(Boolean).join(" · ")}</div>`
      : `<div style="font-size:12px;color:#c8c7c7;margin-top:4px">Nothing is waiting on a decision.</div>`
  }</div>`;
}

function riskCard(r: ProjectReportData["topRisk"], compact = false): string {
  return `<div style="border:1px solid #f08080;border-radius:10px;padding:${compact ? 11 : 12}px 14px"><div style="display:flex;justify-content:space-between;gap:8px"><span style="${EYEBROW};color:#841717;white-space:nowrap">Top risk</span>${r ? `<span style="font-size:10px;font-weight:700;color:#841717">${esc(r.rating.toUpperCase())}</span>` : ""}</div>${
    r
      ? `<div style="font-weight:600;margin-top:4px">${esc(r.title)}</div><div style="font-size:11px;color:#4b4b4b;margin-top:3px;line-height:1.45">${r.mitigation ? `Response: ${esc(r.mitigation)}` : "No mitigation recorded."}${r.owner ? ` Owner ${esc(r.owner)}.` : ""}</div>`
      : `<div style="font-size:12px;color:#9f9f9f;margin-top:4px;font-style:italic">No open risks.</div>`
  }</div>`;
}

function marketTable(d: ProjectReportData, withNote: boolean): string {
  const th = (t: string, left = false) => `<th style="padding:6px ${left ? 14 : 4}px;font-weight:600;text-align:${left ? "left" : "center"}">${esc(t)}</th>`;
  return `<div style="border:1px solid #e9e9e9;border-radius:10px;overflow:hidden">
    <div style="padding:9px 14px;background:#f8fafc;border-bottom:1px solid #e9e9e9;${EYEBROW}">Markets</div>
    <table style="font-size:11px"><thead><tr style="color:#6b6b6b;font-size:10px">${th("Market", true)}${th("Status")}${th("Progress")}${th("This week")}${withNote ? th("Note", true) : ""}</tr></thead><tbody>${d.markets
      .map((m) => {
        const p = ragPrint(m.rag);
        return `<tr style="border-top:1px solid #e9e9e9"><td style="padding:6px 14px;font-weight:600;white-space:nowrap">${esc([m.flag, m.name].filter(Boolean).join(" "))}</td><td style="padding:4px;text-align:center;color:#4b4b4b">${esc(m.status)}</td><td style="padding:4px;text-align:center">${m.progress}%</td><td style="padding:4px;text-align:center"><span style="display:inline-block;min-width:64px;border-radius:4px;background:${p.bg};color:${p.fg};font-weight:700;font-size:9.5px;padding:3px 6px">${esc(m.rag.toUpperCase())}</span>${m.checkedIn ? "" : `<div style="font-size:9px;color:#9f9f9f">no check-in · track status</div>`}</td>${
          withNote ? `<td style="padding:6px 14px;color:#4b4b4b;line-height:1.35">${esc(m.narrative ?? "—")}</td>` : ""
        }</tr>`;
      })
      .join("")}</tbody></table>
    <div style="padding:8px 14px;font-size:10px;color:#6b6b6b;border-top:1px solid #e9e9e9">This week = the market's check-in RAG; without a check-in the track's status decides. Progress from the market's gates.</div>
  </div>`;
}

function kpi(big: string, small: string, label: string, sub: string): string {
  return `<div style="${CARD}"><div style="font-size:24px;font-weight:800;line-height:1">${esc(big)} <span style="font-size:13px;font-weight:600;color:#6b6b6b">${esc(small)}</span></div><div style="font-weight:600;margin-top:4px">${esc(label)}</div><div style="font-size:11px;color:#6b6b6b;margin-top:2px">${esc(sub)}</div></div>`;
}

function footerLeft(d: ProjectReportData): string {
  const signed = d.checkIn.status === "Confirmed" ? `RAG confirmed by ${d.checkIn.confirmedByName ?? "the PM"}${d.checkIn.confirmedAt ? ` on ${shortDate(d.checkIn.confirmedAt)}` : ""}` : "RAG computed — the PM has not confirmed this week's update";
  const live = d.week.isCurrent ? "" : ` · Gates, board and register as of ${shortDate(d.week.generatedAt)}`;
  return `Status key: Green on track · Amber needs attention · Red off track. Generated by QUBIT from the Week ${d.week.number} status update; ${signed}.${live}`;
}

function headerRight(d: ProjectReportData): string {
  const meta = `<div style="font-size:11px;color:#4b4b4b;text-align:right">Report date ${shortDate(d.week.generatedAt)} · Week ${d.week.number}<br>${[d.project.pmName ? `PM ${esc(d.project.pmName)}` : null, d.project.sponsor ? `Sponsor ${esc(d.project.sponsor)}` : null].filter(Boolean).join(" · ") || "&nbsp;"}</div>`;
  return `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">${meta}</div>`;
}

/** Page 1 — Build one-pager. */
export function buildPage(d: ProjectReportData): string {
  const overall = ragPrint(d.checkIn.overallRag);
  const dims = d.dims
    .map((c) => {
      const p = dimPrint(c.rag);
      return `<div style="${CARD}"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span style="${EYEBROW}">${esc(c.key)}</span><span style="border-radius:999px;background:${p.bg};color:${p.fg};padding:1px 8px;font-size:10.5px;font-weight:700">${c.rag === "N" ? "Not rated" : p.label}</span></div><p style="margin-top:6px;line-height:1.45;color:#2b2b2b">${esc(c.line)}</p></div>`;
    })
    .join("");
  return `${header({ eyebrow: "Project status report · Build", title: d.project.name, subtitle: d.checkIn.narrative ?? d.project.summary, right: headerRight(d), brandColor: d.brandColor })}
  <div style="display:grid;grid-template-columns:200px 1fr 1fr 1fr;gap:12px">
    <div style="border-radius:10px;background:${overall.bg};padding:14px 16px;display:flex;flex-direction:column;justify-content:center"><div style="${EYEBROW};color:${overall.fg}">Overall</div><div style="font-size:30px;font-weight:800;color:${overall.fg};line-height:1.1">${esc(d.checkIn.overallRag.toUpperCase())}</div><div style="font-size:11px;color:${overall.fg};margin-top:2px">${esc(d.checkIn.overrideReason ?? (d.checkIn.status === "Confirmed" ? "Confirmed by the PM" : "Computed from the board"))}</div></div>
    ${dims}
  </div>
  <div>${sectionTitle("Where we are · gates")}${gateStrip(d.gates)}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:14px;flex:1;min-height:0">
    <div style="${CARD}">${sectionTitle("Done this week")}${list(d.doneThisWeek.length ? d.doneThisWeek : d.checkIn.lines, "A quiet week — no tracked movement.")}</div>
    <div style="${CARD}">${sectionTitle("Next steps")}${nextSteps(d.nextSteps)}</div>
    <div style="display:flex;flex-direction:column;gap:10px">${decisionCard(d.decision)}${riskCard(d.topRisk)}</div>
  </div>
  <div class="foot"><span>${esc(footerLeft(d))}</span><span style="white-space:nowrap">Internal and confidential</span></div>`;
}

/** Page 2 — In-market one-pager. */
export function marketPage(d: ProjectReportData): string {
  const k = d.marketKpis;
  return `${header({ eyebrow: "Project status report · Market rollout", title: d.project.name, subtitle: `Markets and this week's check-ins · as at ${longDate(d.week.generatedAt)}`, right: ragTile("In market", d.checkIn.marketRag, "sm"), brandColor: d.brandColor })}
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
    ${kpi(String(k.tracks), k.tracks === 1 ? "market" : "markets", "In rollout", d.markets.map((m) => m.code).join(", ") || "—")}
    ${kpi(String(k.onTrack), `of ${k.tracks}`, "Markets on track", d.markets.filter((m) => m.status === "OnTrack" || m.status === "Completed").map((m) => m.code).join(", ") || "None yet")}
    ${kpi(String(k.checkedIn), `of ${k.tracks}`, "Checked in this week", k.checkedIn < k.tracks ? `${k.tracks - k.checkedIn} showing track status` : "Every market reported")}
    ${kpi(k.gatesTotal ? String(k.gatesDone) : "—", k.gatesTotal ? `of ${k.gatesTotal}` : "", "Market gates done", k.gatesTotal ? "Across all market tracks" : "No market gates recorded")}
  </div>
  <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:14px;flex:1;min-height:0">
    ${marketTable(d, true)}
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="${CARD}">${sectionTitle("Progress this week")}${list(d.markets.filter((m) => m.narrative).map((m) => `${m.code}: ${m.narrative}`).concat(d.checkIn.narrative ? [d.checkIn.narrative] : []), "No market check-ins this week.")}</div>
      <div style="border:1px solid #f4b96a;border-radius:10px;padding:11px 14px">${sectionTitle("Risks & issues", "#824704")}${list(d.risksAndIssues, "Nothing open in the register.")}</div>
      <div style="border-radius:10px;background:#231f20;color:#fff;padding:11px 14px"><div style="${EYEBROW};color:#f8a4a7;margin-bottom:6px">Next steps & decisions</div>${
        d.nextSteps.length || d.decision
          ? `<ul style="margin:0;padding-left:16px;line-height:1.45;font-size:11.5px">${d.nextSteps.slice(0, 4).map((s) => `<li>${esc(s.title)}${s.due ? ` — by ${shortDate(s.due)}` : ""}${s.owner ? ` (${esc(s.owner)})` : ""}</li>`).join("")}${d.decision ? `<li>Decision: ${esc(d.decision.description)}</li>` : ""}</ul>`
          : `<p style="font-size:11.5px;color:#c8c7c7">Nothing due in the next two weeks.</p>`
      }</div>
    </div>
  </div>
  <div class="foot"><span>Generated by QUBIT from market check-ins and the Week ${d.week.number} status update.${d.week.isCurrent ? "" : ` Market status and register as of ${shortDate(d.week.generatedAt)}.`}</span><span style="white-space:nowrap">Internal and confidential</span></div>`;
}

/** Page 3 — Build + In market, two columns. */
export function dualPage(d: ProjectReportData): string {
  const live = d.markets.filter((m) => m.status === "OnTrack" || m.status === "Completed").length;
  return `${header({ eyebrow: "Project status report · Build + In market", title: d.project.name, subtitle: d.checkIn.narrative ?? d.project.summary, right: `<div style="display:flex;gap:10px">${ragTile("Build", d.checkIn.buildRag, "sm")}${ragTile("In market", d.checkIn.marketRag, "sm")}</div>`, brandColor: d.brandColor })}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;flex:1;min-height:0">
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;align-items:baseline;gap:8px"><span style="${EYEBROW}">Build</span><span style="font-size:11px;color:#6b6b6b">${d.gates.length ? `${d.gatesDone} of ${d.gates.length} gates` : "no gate template"}${d.project.dueDate ? ` · due ${shortDate(d.project.dueDate)}` : ""}</span></div>
      ${gateStrip(d.gates, true)}
      <div style="${CARD};padding:11px 14px">${sectionTitle("This week")}${list(
        [
          `${d.boardCounts.done} done, ${d.boardCounts.inProgress} in progress or review`,
          d.boardCounts.blocked ? `${d.boardCounts.blocked} blocked` : null,
          d.boardCounts.overdue ? `${d.boardCounts.overdue} overdue` : null,
          ...d.checkIn.lines.filter((l) => !/^A quiet week/.test(l)).slice(0, 2),
        ].filter((x): x is string => Boolean(x)),
        "A quiet week.",
      )}</div>
      ${decisionCard(d.decision, true)}
      ${riskCard(d.topRisk, true)}
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;align-items:baseline;gap:8px"><span style="${EYEBROW}">In market</span><span style="font-size:11px;color:#6b6b6b">${live} of ${d.markets.length} markets on track</span></div>
      ${marketTable(d, false)}
      <div style="${CARD};padding:11px 14px">${sectionTitle("Markets this week")}${list(d.markets.filter((m) => m.narrative).map((m) => `${m.code}: ${m.narrative}`), "No market check-ins this week.")}</div>
      <div style="${CARD};padding:11px 14px">${sectionTitle("Next steps")}${d.nextSteps.length ? list(d.nextSteps.slice(0, 4).map((s) => `${s.title}${s.due ? ` — by ${shortDate(s.due)}` : ""}${s.owner ? ` (${s.owner})` : ""}`), "") : `<p style="color:#9f9f9f;font-style:italic">Nothing due in the next two weeks.</p>`}</div>
    </div>
  </div>
  <div class="foot"><span>Two tracks, one report: Build RAG from gates, board and register; In-market RAG from market check-ins. Overall = the worse of the two.${d.week.isCurrent ? "" : ` Gates, board and markets as of ${shortDate(d.week.generatedAt)}.`}</span><span style="white-space:nowrap">Internal and confidential</span></div>`;
}

export function renderProjectReport(d: ProjectReportData): RenderedReport {
  const page = d.template === "build" ? buildPage(d) : d.template === "market" ? marketPage(d) : dualPage(d);
  return {
    html: pagedDocument(`${d.project.code} · Week ${d.week.number} status report`, [page]),
    spec: { landscape: true },
    filenameStem: `qubit-${stem(d.project.code)}-${d.week.isoWeek}-${d.template}`,
  };
}

/** Page 4 — Portfolio digest (the Head's roll-up), a flowing table. */
export function renderDigest(d: DigestReportData): RenderedReport {
  const c = d.counts;
  const sum = c.green + c.amber + c.red || 1;
  const pct = (n: number) => `${Math.round((n / sum) * 100)}%`;
  const approved = d.status === "Approved";
  const prepared = approved
    ? `Prepared by ${esc(d.approvedByName ?? "the Head")}, ${esc(d.tenantName)} · ${d.approvedAt ? longDate(d.approvedAt) : longDate(d.week.generatedAt)} · Classification: Internal and Confidential`
    : `Draft — not yet approved by the Head · ${esc(d.tenantName)} · generated ${longDate(d.week.generatedAt)} · Internal and Confidential`;
  const rows = d.groups
    .map(
      (g) =>
        `<tr style="background:#f8fafc"><td colspan="4" style="padding:5px 10px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b6b6b;border-top:1px solid #e9e9e9">${esc(g.portfolioName)}</td></tr>` +
        g.rows
          .map((r) => {
            const p = ragPrint(r.rag);
            return `<tr style="border-top:1px solid #e9e9e9"><td style="padding:7px 10px;font-weight:600;vertical-align:top">${esc(r.name)}<div style="font-size:10px;font-weight:400;color:#6b6b6b">${esc(r.code)}${r.pmName ? ` · ${esc(r.pmName)}` : ""}</div></td><td style="padding:7px 10px;vertical-align:top"><span style="display:inline-flex;align-items:center;gap:5px;font-weight:700;color:${p.fg};white-space:nowrap"><span style="width:9px;height:9px;border-radius:2px;background:${p.bar};display:inline-block"></span>${esc(r.rag.toUpperCase())}</span>${r.checkIn !== "Confirmed" ? `<div style="font-size:9.5px;color:#9f9f9f">computed</div>` : ""}</td><td style="padding:7px 10px;color:#2b2b2b;vertical-align:top">${esc(r.stage)}${r.marketSummary ? `<br><span style="color:#6b6b6b">${esc(r.marketSummary)}</span>` : ""}</td><td style="padding:7px 10px;line-height:1.45;color:#2b2b2b;vertical-align:top">${r.narrative ? esc(r.narrative) : `<span style="color:#9f9f9f;font-style:italic">${r.checkIn === "Confirmed" ? "No line this week." : "Not yet sent — computed status shown."}</span>`}</td></tr>`;
          })
          .join(""),
    )
    .join("");
  const body = `
  <div style="display:flex;flex-direction:column;gap:12px">
    ${header({ eyebrow: "Weekly roll-up · Internal leadership briefing", title: `Project Status Report — Week ${d.week.number}`, subtitle: null, right: "", brandColor: d.brandColor })}
    <p style="font-size:12px;color:#4b4b4b;margin-top:-6px">${prepared}</p>
    <div style="display:flex;align-items:center;gap:16px;font-size:11px;color:#4b4b4b;flex-wrap:wrap">
      <span><b style="color:#231f20">${d.total} ${d.total === 1 ? "project" : "projects"}</b> · ${c.green} green · ${c.amber} amber · ${c.red} red${c.computed ? ` · ${c.computed} computed` : ""}</span>
      <span style="display:flex;height:8px;width:180px;overflow:hidden;border-radius:999px;background:#e9e9e9"><span style="width:${pct(c.green)};background:#16a34a"></span><span style="width:${pct(c.amber)};background:#d97706"></span><span style="width:${pct(c.red)};background:#dc2626"></span></span>
      <span style="margin-left:auto">RAG key: <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#16a34a;vertical-align:middle"></span> Green on track · <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#d97706;vertical-align:middle"></span> Amber needs attention · <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#dc2626;vertical-align:middle"></span> Red at risk</span>
    </div>
    ${d.narrative ? `<p style="font-size:13px;line-height:1.5;color:#231f20;border-left:3px solid ${esc(d.brandColor)};padding-left:12px">“${esc(d.narrative)}”</p>` : `<p style="font-size:12px;color:#9f9f9f;font-style:italic;border-left:3px solid #e9e9e9;padding-left:12px">The Head has not written this week's line yet.</p>`}
    <table style="font-size:11px">
      <thead><tr style="background:#231f20;color:#fff;font-size:10px;letter-spacing:.06em;text-transform:uppercase"><th style="text-align:left;padding:7px 10px;font-weight:600;width:22%">Project</th><th style="text-align:left;padding:7px 10px;font-weight:600;width:9%">Status</th><th style="text-align:left;padding:7px 10px;font-weight:600;width:19%">Stage</th><th style="text-align:left;padding:7px 10px;font-weight:600">Update and outlook</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4" style="padding:14px 10px;color:#9f9f9f;font-style:italic">No projects in this roll-up.</td></tr>`}</tbody>
    </table>
  </div>`;
  const left = approved
    ? `Status updates as confirmed by project managers in QUBIT for Week ${d.week.number}; RAG approved by the Head${d.approvedAt ? ` on ${shortDate(d.approvedAt)}` : ""}.`
    : `Draft roll-up for Week ${d.week.number} — not yet approved by the Head.`;
  return {
    html: flowingDocument(`Week ${d.week.number} roll-up`, body),
    spec: { landscape: true, footerTemplate: flowFooter(left), margin: DIGEST_MARGIN },
    filenameStem: `qubit-rollup-${d.week.isoWeek}${approved ? "" : "-draft"}`,
  };
}

function cell(value: ReportCell, type: string): string {
  if (value === null || value === undefined || value === "") return `<span style="color:#c4c4c4">—</span>`;
  if (type === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return shortDate(value) + " " + value.getUTCFullYear();
  if (type === "date") {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? esc(String(value)) : `${shortDate(d)} ${d.getUTCFullYear()}`;
  }
  return esc(String(value));
}

/** The custom "Data table" report: the module's rows and the chosen columns, same shell,
 * flowing so a long table paginates with its header row repeated. */
export function renderTable(d: TableReportData): RenderedReport {
  const wide = d.columns.length > 7;
  const body = `
  <div style="display:flex;flex-direction:column;gap:12px">
    ${header({ eyebrow: `Custom report · ${d.moduleLabel}`, title: d.title, subtitle: d.description, right: `<div style="font-size:11px;color:#4b4b4b;text-align:right">Generated ${longDate(d.generatedAt)}<br>${d.rows.length} ${d.rows.length === 1 ? "row" : "rows"} · ${d.columns.length} ${d.columns.length === 1 ? "column" : "columns"}</div>`, brandColor: d.brandColor })}
    <table style="font-size:${wide ? 9.5 : 11}px">
      <thead><tr style="background:#231f20;color:#fff;font-size:${wide ? 8.5 : 10}px;letter-spacing:.06em;text-transform:uppercase">${d.columns.map((c) => `<th style="text-align:left;padding:6px 8px;font-weight:600;white-space:nowrap">${esc(c.label)}</th>`).join("")}</tr></thead>
      <tbody>${
        d.rows.length === 0
          ? `<tr><td colspan="${d.columns.length}" style="padding:14px 8px;color:#9f9f9f;font-style:italic">No rows in scope.</td></tr>`
          : d.rows
              .map((r, i) => `<tr style="border-top:1px solid #e9e9e9;${i % 2 ? "background:#fafbfc" : ""}">${d.columns.map((c) => `<td style="padding:5px 8px;vertical-align:top;color:#2b2b2b;line-height:1.35;max-width:3in;word-wrap:break-word">${cell(r[c.key] ?? null, c.type)}</td>`).join("")}</tr>`)
              .join("")
      }</tbody>
    </table>
  </div>`;
  return {
    html: flowingDocument(`${d.title} · custom report`, body),
    spec: { landscape: true, footerTemplate: flowFooter(`Generated by QUBIT from live ${d.moduleLabel.toLowerCase()} data on ${shortDate(d.generatedAt)}.`), margin: DIGEST_MARGIN },
    filenameStem: `qubit-report-${stem(d.dataset)}-${d.generatedAt.toISOString().slice(0, 10)}`,
  };
}
