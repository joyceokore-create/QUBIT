import { DEFAULT_TIME_ZONE, formatDate, formatDayMonth } from "@/lib/dates";
import { bullets, health, labReport, prose, raw, section, stacked, statusCell, statusMarker, table, type Cell, type MarkerKind, type Notice, type Row, type StatusItem } from "@/server/pdf/blocks";
import type { Orientation } from "@/server/pdf/shell";
import type { DigestReportData, DigestRow, GateCell, ProjectReportData, TableReportData } from "@/server/pdf/report-data";
import type { ReportCell } from "@/server/custom-reports";
import type { RenderPdfOptions } from "@/server/pdf/render";

/**
 * UX plan D14 — the print templates, all in the one "lab report" layout (blocks.ts):
 * the weekly roll-up (digest), the project one-pagers (Build, In market, Build + In market)
 * and the custom data table. Pure functions of their read model → a self-contained HTML
 * string plus the print spec the renderer needs. Orientation: Build-only is A4 portrait;
 * everything that was landscape stays A4 landscape. Every string that came from a person
 * reaches the page through the blocks, which escape it.
 */

export interface RenderedReport {
  html: string;
  spec: RenderPdfOptions;
  filenameStem: string;
}

/** Presentation inputs that are not part of the read model. */
export interface RenderOptions {
  /** The tenant's IANA zone (getTenantTimeZone) — every date on the page is in it. */
  timeZone?: string;
}

const stem = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "report";
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
/** "OnTrack" → "On track". */
export const humanize = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/ (\w)/g, (_, c: string) => ` ${c.toLowerCase()}`);

const GATE_MARKER: Record<GateCell["state"], MarkerKind> = { Done: "done", InProgress: "progress", Blocked: "warn", NotStarted: "todo" };

// ── Project one-pagers ─────────────────────────────────────────────────────────────────

const TITLE: Record<ProjectReportData["template"], string> = {
  build: "Project status report · Build",
  market: "Project status report · In market",
  dual: "Project status report · Build + In market",
};

/** The notice: a decision waiting beats an unconfirmed week; otherwise confidentiality. */
export function projectAttention(d: ProjectReportData): Notice | null {
  if (d.decision) {
    const age = `open ${plural(d.decision.ageDays, "day")}`;
    return { kind: "attention", label: "Needs a decision:", text: `${d.decision.description} — ${age}${d.decision.owner ? `, owner ${d.decision.owner}` : ""}.` };
  }
  if (d.checkIn.status !== "Confirmed") {
    return { kind: "attention", label: "Not yet confirmed:", text: `the PM has not confirmed the Week ${d.week.number} update — status is computed from gates, board and register.` };
  }
  return null;
}

function checkInMarker(d: ProjectReportData): Cell {
  return d.checkIn.status === "Confirmed" ? statusMarker("done", "Confirmed") : statusMarker("warn", "Not confirmed");
}

function boardLine(d: ProjectReportData): string {
  const b = d.boardCounts;
  return [`${b.done} done`, `${b.inProgress} in progress`, b.blocked ? `${b.blocked} blocked` : null, b.overdue ? `${b.overdue} overdue` : null].filter(Boolean).join(" · ");
}

function projectInfo(d: ProjectReportData, tz: string): { title: string; rows: [string, Cell][] } {
  const p = d.project;
  const rows: [string, Cell][] = [
    ["Code", p.code],
    ["Portfolio", p.portfolioName],
    ...(p.programmeName ? ([["Programme", p.programmeName]] as [string, Cell][]) : []),
    ["Stage", p.pipelineStage],
    ["Project manager", p.pmName],
    ["Sponsor", p.sponsor],
    ["Target date", p.dueDate ? formatDate(p.dueDate, tz) : null],
    ["Reporting week", `Week ${d.week.number} · ${d.week.range}`],
  ];
  if (d.template !== "market") rows.push(["Board this week", boardLine(d)]);
  if (d.checkIn.overrideReason) rows.push(["RAG override", d.checkIn.overrideReason]);
  return { title: "Project information", rows };
}

function projectStatus(d: ProjectReportData): StatusItem[] {
  const dims: StatusItem[] = d.dims.map((c) => ({ label: c.key, value: health(c.rag) }));
  const checkIn: StatusItem = { label: "Check-in", value: checkInMarker(d) };
  if (d.template === "build") return [{ label: "Overall", value: health(d.checkIn.overallRag) }, ...dims, checkIn];
  if (d.template === "dual") {
    return [{ label: "Overall", value: health(d.checkIn.overallRag) }, { label: "Build", value: health(d.checkIn.buildRag) }, { label: "In market", value: health(d.checkIn.marketRag) }, ...dims, checkIn];
  }
  const k = d.marketKpis;
  return [
    { label: "In market", value: health(d.checkIn.marketRag) },
    { label: "Overall", value: health(d.checkIn.overallRag) },
    { label: "Markets on track", value: `${k.onTrack} of ${k.tracks}` },
    { label: "Checked in this week", value: `${k.checkedIn} of ${k.tracks}` },
    { label: "Market gates done", value: k.gatesTotal ? `${k.gatesDone} of ${k.gatesTotal}` : null },
    checkIn,
  ];
}

function updateSection(d: ProjectReportData): string {
  const lines = d.checkIn.lines.filter((l) => !/^A quiet week/.test(l));
  const body = [d.checkIn.narrative ? prose(d.checkIn.narrative) : "", lines.length ? bullets(lines) : ""].join("");
  return section("This week's update", null, body || null);
}

function gatesSection(title: string, gates: GateCell[]): string {
  return section(
    title,
    gates.length,
    table(
      [{ label: "#", width: "22px" }, { label: "Gate", width: "34%" }, { label: "State", width: "18%" }, { label: "Note" }],
      gates.map((g, i) => [i + 1, g.name, statusMarker(GATE_MARKER[g.state], g.label), g.note]),
    ),
  );
}

function marketsSection(d: ProjectReportData): string {
  return section(
    "Markets",
    d.markets.length,
    table(
      [{ label: "Market", width: "16%" }, { label: "Track status", width: "12%" }, { label: "Gates", width: "7%", align: "right" }, { label: "This week", width: "10%" }, { label: "Check-in", width: "15%" }, { label: "Note" }],
      d.markets.map((m) => [
        [m.flag, m.name].filter(Boolean).join(" "),
        humanize(m.status),
        `${m.progress}%`,
        health(m.rag),
        m.checkedIn ? statusMarker("done", "Checked in") : statusMarker("warn", "No check-in"),
        m.narrative,
      ]),
    ),
  );
}

function decisionSection(d: ProjectReportData): string {
  const x = d.decision;
  return section(
    "Needs a decision",
    x ? 1 : 0,
    x ? table([{ label: "Blocker", width: "50%" }, { label: "Owner" }, { label: "Open for" }, { label: "Severity" }], [[x.description, x.owner ?? "No owner", plural(x.ageDays, "day"), x.severity]]) : null,
  );
}

function topRiskSection(d: ProjectReportData): string {
  const r = d.topRisk;
  return section(
    "Top risk",
    r ? 1 : 0,
    r ? table([{ label: "Risk", width: "34%" }, { label: "Rating", width: "10%" }, { label: "Response" }, { label: "Owner", width: "16%" }], [[r.title, r.rating, r.mitigation ?? "No mitigation recorded.", r.owner]]) : null,
  );
}

/** "Risk (High): Vendor slip" → ["Risk (High)", "Vendor slip"]. The loader builds these
 * lines with a fixed prefix, so the first ": " is always the split. */
export function splitRegisterLine(line: string): [string, string] {
  const i = line.indexOf(": ");
  return i < 0 ? ["", line] : [line.slice(0, i), line.slice(i + 2)];
}

function registerSection(d: ProjectReportData): string {
  return section(
    "Risks and issues",
    d.risksAndIssues.length,
    table([{ label: "Type", width: "18%" }, { label: "Item" }], d.risksAndIssues.map((l) => splitRegisterLine(l))),
  );
}

function nextStepsSection(d: ProjectReportData, tz: string): string {
  return section(
    "Next steps",
    d.nextSteps.length,
    table([{ label: "Item", width: "60%" }, { label: "Owner" }, { label: "Due", width: "14%" }], d.nextSteps.map((s) => [s.title, s.owner ?? "Unassigned", s.due ? formatDayMonth(s.due, tz) : null])),
  );
}

function projectSections(d: ProjectReportData, tz: string): string[] {
  const done = section("Done this week", d.doneThisWeek.length, bullets(d.doneThisWeek));
  if (d.template === "build") return [updateSection(d), gatesSection("Gates", d.gates), decisionSection(d), topRiskSection(d), registerSection(d), nextStepsSection(d, tz), done];
  if (d.template === "market") return [updateSection(d), marketsSection(d), decisionSection(d), registerSection(d), nextStepsSection(d, tz)];
  return [updateSection(d), gatesSection("Build gates", d.gates), marketsSection(d), decisionSection(d), topRiskSection(d), registerSection(d), nextStepsSection(d, tz), done];
}

function projectSource(d: ProjectReportData, tz: string): string {
  const signed =
    d.checkIn.status === "Confirmed"
      ? `RAG confirmed by ${d.checkIn.confirmedByName ?? "the PM"}${d.checkIn.confirmedAt ? ` on ${formatDayMonth(d.checkIn.confirmedAt, tz)}` : ""}`
      : "RAG computed — not confirmed by the PM";
  const live = d.week.isCurrent ? "" : " · Gates, board and register are live data";
  return `QUBIT · Week ${d.week.number} status update · ${signed}${live}`;
}

export function projectOrientation(template: ProjectReportData["template"]): Orientation {
  return template === "build" ? "portrait" : "landscape";
}

export function renderProjectReport(d: ProjectReportData, opts: RenderOptions = {}): RenderedReport {
  const tz = opts.timeZone ?? DEFAULT_TIME_ZONE;
  const { html, spec } = labReport({
    docTitle: `${d.project.code} · Week ${d.week.number} status report`,
    orientation: projectOrientation(d.template),
    tenantName: d.tenantName,
    brandColor: d.brandColor,
    timeZone: tz,
    title: d.project.name,
    subtitle: `${TITLE[d.template]} · Week ${d.week.number} (${d.week.range})`,
    generatedAt: d.week.generatedAt,
    attention: projectAttention(d),
    info: projectInfo(d, tz),
    status: { title: "Status", items: projectStatus(d) },
    sections: projectSections(d, tz),
    source: projectSource(d, tz),
  });
  return { html, spec, filenameStem: `qubit-${stem(d.project.code)}-${d.week.isoWeek}-${d.template}` };
}

// ── Weekly roll-up ─────────────────────────────────────────────────────────────────────

function rowCheckIn(r: DigestRow): Cell {
  if (r.checkIn === "Confirmed") return r.submittedToHead ? statusMarker("done", "Sent") : statusMarker("done", "Confirmed");
  if (r.checkIn === "Draft") return statusMarker("progress", "Draft");
  return statusMarker("warn", "Missing");
}

function digestRow(r: DigestRow): Cell[] {
  return [
    stacked(r.name, [r.code, r.pmName].filter(Boolean).join(" · ")),
    raw(`${health(r.rag).html}${r.checkIn !== "Confirmed" ? `<span class="sub">computed</span>` : ""}`),
    rowCheckIn(r),
    stacked(r.stage, r.marketSummary),
    r.narrative ?? raw(`<span class="nil">${r.checkIn === "Confirmed" ? "No line this week." : "Not yet sent — computed status shown."}</span>`),
  ];
}

const DIGEST_COLUMNS = [{ label: "Project", width: "22%" }, { label: "Status", width: "9%" }, { label: "Check-in", width: "11%" }, { label: "Stage", width: "17%" }, { label: "Update and outlook" }];

export function renderDigest(d: DigestReportData, opts: RenderOptions = {}): RenderedReport {
  const tz = opts.timeZone ?? DEFAULT_TIME_ZONE;
  const approved = d.status === "Approved";
  const c = d.counts;
  const groups = d.groups.map((g) => section(g.portfolioName, g.rows.length, table(DIGEST_COLUMNS, g.rows.map((r): Row => digestRow(r)))));
  const { html, spec } = labReport({
    docTitle: `Week ${d.week.number} roll-up`,
    orientation: "landscape",
    tenantName: d.tenantName,
    brandColor: d.brandColor,
    timeZone: tz,
    title: `Weekly roll-up — Week ${d.week.number}`,
    subtitle: `Project status report · ${d.week.range} · ${d.tenantName}`,
    generatedAt: d.week.generatedAt,
    attention: approved ? null : { kind: "attention", label: "Draft:", text: "not yet approved by the Head — computed status is shown where a PM has not confirmed." },
    info: {
      title: "Report information",
      rows: [
        ["Report", "Weekly roll-up · leadership briefing"],
        ["Week", `Week ${d.week.number} · ${d.week.range}`],
        ["Organisation", d.tenantName],
        ["Approval", approved ? `Approved by ${d.approvedByName ?? "the Head"}${d.approvedAt ? ` on ${formatDate(d.approvedAt, tz)}` : ""}` : "Draft — not yet approved by the Head"],
        ["Projects", plural(d.total, "project")],
        ["Portfolios", d.groups.length],
      ],
    },
    status: {
      title: "Status",
      items: [
        { label: "On track", value: c.green, tone: "ok" },
        { label: "At risk", value: c.amber, tone: "warn" },
        { label: "Off track", value: c.red, tone: "bad" },
        { label: "Computed (not confirmed)", value: c.computed, tone: "muted" },
      ],
    },
    sections: [section("Head's summary", null, d.narrative ? prose(d.narrative) : null), ...(groups.length ? groups : [section("Projects", 0, null)])],
    source: approved
      ? `QUBIT weekly roll-up, Week ${d.week.number} · Status as confirmed by project managers; RAG approved by the Head${d.approvedAt ? ` on ${formatDayMonth(d.approvedAt, tz)}` : ""}`
      : `QUBIT weekly roll-up, Week ${d.week.number} · Draft, not yet approved by the Head`,
  });
  return { html, spec, filenameStem: `qubit-rollup-${d.week.isoWeek}${approved ? "" : "-draft"}` };
}

// ── Custom data table ──────────────────────────────────────────────────────────────────

function tableCell(value: ReportCell, type: string, key: string, tz: string): Cell {
  if (value === null || value === undefined || value === "") return null;
  if (type === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return formatDate(value, tz);
  if (type === "date") {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : formatDate(d, tz);
  }
  if (type === "enum" && key === "status") return statusCell(String(value));
  return typeof value === "number" ? value : String(value);
}

/** The status grid of a data table: rows and columns, plus a tally of the Status column when
 * the report includes one (top 6 values, most frequent first). */
export function tableStatusItems(d: Pick<TableReportData, "columns" | "rows">): StatusItem[] {
  const items: StatusItem[] = [
    { label: "Rows", value: d.rows.length },
    { label: "Columns", value: d.columns.length },
  ];
  const status = d.columns.find((c) => c.key === "status" && c.type === "enum");
  if (!status) return items;
  const tally = new Map<string, number>();
  for (const r of d.rows) {
    const v = r[status.key];
    if (v !== null && v !== undefined && v !== "") tally.set(String(v), (tally.get(String(v)) ?? 0) + 1);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6);
  return [...items, ...top.map(([v, n]): StatusItem => ({ label: humanize(v), value: n }))];
}

export function renderTable(d: TableReportData, opts: RenderOptions = {}): RenderedReport {
  const tz = opts.timeZone ?? DEFAULT_TIME_ZONE;
  const wide = d.columns.length > 7;
  const rows = d.rows.map((r) => d.columns.map((c) => tableCell(r[c.key] ?? null, c.type, c.key, tz)));
  const grid = table(
    d.columns.map((c) => ({ label: c.label, ...(c.type === "number" ? { align: "right" as const } : {}) })),
    rows,
  );
  const { html, spec } = labReport({
    docTitle: `${d.title} · custom report`,
    orientation: "landscape",
    tenantName: d.tenantName,
    brandColor: d.brandColor,
    timeZone: tz,
    title: d.title,
    subtitle: `Custom report · ${d.moduleLabel}`,
    generatedAt: d.generatedAt,
    attention: null,
    info: {
      title: "Report information",
      rows: [
        ["Report", d.title],
        ["Module", d.moduleLabel],
        ["About", d.description],
        ["Columns", d.columns.map((c) => c.label).join(", ")],
      ],
    },
    status: { title: "Summary", items: tableStatusItems(d) },
    // Designer, 12 Nov 2026: the table follows the panels directly (no "Rows (N)" heading; the
    // Summary panel already gives the row count).
    sections: [d.rows.length ? `<section class="sec">${wide ? `<div style="font-size:9px">${grid}</div>` : grid}</section>` : section("Rows", 0, null)],
    source: `QUBIT custom report · Live ${d.moduleLabel.toLowerCase()} data`,
  });
  return { html, spec, filenameStem: `qubit-report-${stem(d.dataset)}-${d.generatedAt.toISOString().slice(0, 10)}` };
}
