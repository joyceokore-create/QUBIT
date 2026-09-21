"use client";

import { useState } from "react";
import "./pm-v3.css";
import { Ic, RagChipV3, RagBarV3, Gate, RAG_LABEL } from "./pm-v3";
import { usePublishSections } from "./section-nav";

// Head of PMs view — markup ported 1:1 from the approved artifact's renderHead().

export interface HeadRow {
  id: string;
  name: string;
  desc: string;
  pmInitials: string | null;
  prio: string;
  phase: string;
  stage: string;
  gates: string[]; // 6, in GATE order
  pct: number;
  calc: "G" | "A" | "R" | "N";
  rep: "G" | "A" | "R" | "N";
  dispute: boolean;
  target: string; // formatted or "—"
  targetPast: boolean;
  upd: number;
  bucket: string; // group key
  pmId: string | null;
  daysToTarget: number;
}

export interface HeadV3Props {
  briefLines: { emphasis: string; detail: string }[];
  generatedAt: string;
  gateLabels: string[];
  buckets: { key: string; label: string; color: string }[];
  stats: {
    approved: number;
    approvedCounts: { R: number; A: number; G: number; N: number };
    disputes: number;
    stale: number;
    stale14: number;
    gatesWaiting: number;
    gatesOldest: string;
    escal: number;
    overAlloc: number;
    overAllocNames: string;
  };
  pmCards: { id: string; initials: string; name: string; title: string; counts: { R: number; A: number; G: number; N: number }; n: number; onTime: number; disputes: number; allocPct: number | null }[];
  disputes: { id: string; name: string; rep: string; calc: string; pmName: string; drivers: string; targetNote: string }[];
  stale: { id: string; name: string; upd: number; phase: string; stage: string; calcLabel: string; pmName: string }[];
  gatesWaitingRows: { id: string; name: string; gate: string; since: string; pmName: string }[];
  escalRows: { id: string; name: string; t: string }[];
  rows: HeadRow[];
  pms: { id: string; name: string }[];
  conflicts: { sev: "R" | "A"; who: string; title: string; desc: string }[];
  trend: { weeks: string[]; series: [number, number, number][] };
}

/** The artifact's ragchart: legend + totals + stacked weekly SVG. */
export function TrendChart({ title, weeks, series, muted }: { title: string; weeks: string[]; series: [number, number, number][]; muted?: boolean }) {
  const last = series[series.length - 1] ?? [0, 0, 0];
  const W = 360, H = 140, pl = 26, pr = 8, pt = 10, pb = 22;
  const max = Math.max(12, ...series.map(([g, a, r]) => g + a + r));
  const iw = W - pl - pr, ih = H - pt - pb, bw = iw / (series.length || 1);
  const y = (v: number) => pt + ih - (v / max) * ih;
  const gridVals = [0, Math.round(max / 3), Math.round((2 * max) / 3), max];
  return (
    <div className={`ragchart${muted ? " muted" : ""}`}>
      <div className="ragchart-title">{title}</div>
      <div className="ragchart-leg"><span><i className="dot g" />Green</span><span><i className="dot a" />Amber</span><span><i className="dot r" />Red</span></div>
      <div className="ragchart-nums">
        <div><b className="g">{last[0]}</b><span>Green</span></div>
        <div><b className="a">{last[1]}</b><span>Amber</span></div>
        <div><b className="r">{last[2]}</b><span>Red</span></div>
      </div>
      {series.length > 0 ? (
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {gridVals.map((v) => (
            <g key={v}><line className="grid" x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} /><text x={pl - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>
          ))}
          {series.map((w, i) => {
            const x = pl + i * bw + bw * 0.18, ww = bw * 0.64;
            let acc = 0;
            const parts: [number, string][] = [[w[2], "br"], [w[1], "ba"], [w[0], "bg"]];
            return (
              <g key={i}>
                {parts.map(([v, cls], k) => {
                  if (!v) return null;
                  const y1 = y(acc + v), h = y(acc) - y1;
                  acc += v;
                  return <rect key={k} className={cls} x={x} y={y1} width={ww} height={Math.max(h, 0)} rx={3} />;
                })}
                <text x={x + ww / 2} y={H - 6} textAnchor="middle">{weeks[i]}</text>
              </g>
            );
          })}
        </svg>
      ) : (
        <span className="hint">Trend builds as nightly snapshots accrue.</span>
      )}
    </div>
  );
}

const AV_COLORS = ["teal", "red", "blue", "violet"];

export function HeadV3(props: HeadV3Props) {
  const [headSort, setHeadSort] = useState<"rag" | "date" | "stale">("rag");
  const [headPm, setHeadPm] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const GROUP_LIMIT = 5;
  const toggleExpanded = (key: string) => setExpanded((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const toggleGroup = (key: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  // The section links render in the app sidebar as the Dashboard dropdown.
  usePublishSections([
    { id: "head-top", icon: "grid", label: "Overview" },
    { id: "head-pms", icon: "list", label: "By PM" },
    { id: "disputes", icon: "warn", label: "Exceptions" },
    { id: "head-tracker", icon: "calcheck", label: "Tracker" },
    { id: "head-insights", icon: "compare", label: "Insights" },
    { id: "custom-reports", icon: "report", label: "Custom Reports", href: "/reports?tab=custom" },
  ]);

  const ragOrder: Record<string, number> = { R: 0, A: 1, G: 2, N: 3 };
  const sortFn =
    headSort === "rag" ? (x: HeadRow, y: HeadRow) => ragOrder[x.calc] - ragOrder[y.calc]
    : headSort === "date" ? (x: HeadRow, y: HeadRow) => x.daysToTarget - y.daysToTarget
    : (x: HeadRow, y: HeadRow) => y.upd - x.upd;
  const q = search.trim().toLowerCase();
  const filtered = props.rows.filter((r) => (!headPm || r.pmId === headPm) && (!q || `${r.name} ${r.desc} ${r.stage}`.toLowerCase().includes(q)));

  return (
    <div className="pmv3">
      <div style={{ display: "grid", gap: 20 }}>
        <div className="pm-headerbar">
          <div className="pm-hb-main">
            <h1>Dashboard</h1>
            <div className="pm-hb-search"><input type="search" placeholder="Search all projects…" aria-label="Search all projects" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          </div>
        </div>

        <div className="pm-shell">
          <div className="pm-content">
            <div className="pm-toprow" id="head-top">
              <section className="pm-hero">
                <div className="pm-hero-top">
                  <span className="pm-hero-tag"><Ic name="sparkle" />Daily Brief</span>
                  <span className="pm-hero-meta">Generated {props.generatedAt} today · Head of PMs</span>
                </div>
                <div className="pm-hero-body">{props.briefLines.map((l, i) => <p key={i}><b>{l.emphasis}</b> {l.detail}</p>)}</div>
                <p className="pm-hero-foot">Generated from status updates, gate records and RAID items — verify before acting.</p>
              </section>
              <div className="pm-statgrid">
                <div className="pm-stat"><div className="pm-stat-icon blue"><Ic name="folder" /></div><div className="v num">{props.stats.approved}</div><div className="l">Approved & in delivery</div><RagBarV3 c={props.stats.approvedCounts} /></div>
                <div className={`pm-stat ${props.stats.disputes ? "hot" : ""}`}><div className="pm-stat-icon violet"><Ic name="compare" /></div><div className="v num">{props.stats.disputes}</div><div className="l">RAG disputes</div><div className="d">reported greener</div></div>
                <div className={`pm-stat ${props.stats.stale14 ? "hot" : ""}`}><div className="pm-stat-icon amber"><Ic name="alarm" /></div><div className="v num">{props.stats.stale}</div><div className="l">Stale status updates</div><div className="d">{props.stats.stale14} older than 14 days</div></div>
                <div className="pm-stat"><div className="pm-stat-icon teal"><Ic name="calcheck" /></div><div className="v num">{props.stats.gatesWaiting}</div><div className="l">Gate approvals waiting on me</div><div className="d">{props.stats.gatesOldest}</div></div>
                <div className={`pm-stat ${props.stats.escal ? "hot" : ""}`}><div className="pm-stat-icon red"><Ic name="warn" /></div><div className="v num">{props.stats.escal}</div><div className="l">To escalate upward</div><div className="d">need Director / Group action</div></div>
                <div className="pm-stat"><div className="pm-stat-icon blue"><Ic name="battery" /></div><div className="v num">{props.stats.overAlloc}</div><div className="l">PMs over 100%</div><div className="d">{props.stats.overAllocNames || "—"}</div></div>
              </div>
            </div>

            <section className="panel" id="head-pms">
              <div className="panel-h"><h2>By project manager</h2><span className="sub">Click a PM to open their view</span></div>
              <div className="pmgrid">
                {props.pmCards.map((pm, i) => (
                  <button key={pm.id} type="button" className="pmcard" data-pm={pm.id}>
                    <div className="h"><span className={`av ${AV_COLORS[i % AV_COLORS.length]}`}>{pm.initials}</span><div className="pmcard-who"><b>{pm.name}</b><span>{pm.title}</span></div></div>
                    <RagBarV3 c={pm.counts} />
                    <div className="kv">
                      <span>Projects</span><b className="num">{pm.n}</b>
                      <span>Red / amber</span><b className="num">{pm.counts.R} / {pm.counts.A}</b>
                      <span>Updates on time</span><b className="num">{pm.onTime}/{pm.n}</b>
                      <span>RAG disputes</span><b className="num">{pm.disputes}</b>
                      {pm.allocPct != null && <><span>Allocation</span><b className="num" style={{ color: pm.allocPct > 100 ? "var(--red-ink)" : "inherit" }}>{pm.allocPct}%</b></>}
                    </div>
                    {pm.allocPct != null && <div className="load"><i className={pm.allocPct > 100 ? "over" : undefined} style={{ width: `${(Math.min(pm.allocPct / 100, 1.3) / 1.3) * 100}%` }} /></div>}
                  </button>
                ))}
              </div>
            </section>

            <div className="row g12">
              <section className="panel c6" id="disputes">
                <div className="panel-h"><h2>RAG disputes</h2><span className="sub">reported vs calculated</span></div>
                <div className="queue queue-pm">
                  {props.disputes.length === 0 && <span className="hint">No disputes open</span>}
                  {props.disputes.map((p) => (
                    <div className="qi" key={p.id}>
                      <div className="b">
                        <div className="qi-top"><span className="qi-proj"><span className={`qi-proj-icon ${p.calc === "R" ? "red" : "amb"}`}><Ic name="folder" /></span><span className="qi-proj-name">{p.name}</span></span><span className={`qi-status ${p.calc === "R" ? "red" : "amb"}`}>{p.rep}→{p.calc}</span></div>
                        <b className="qi-title">Reported {RAG_LABEL[p.rep]}, calculates {RAG_LABEL[p.calc]}</b>
                        <span className="qi-desc">PM {p.pmName} · Drivers: {p.drivers}{p.targetNote}</span>
                      </div>
                      <div className="m"><button type="button" className="act-btn dark" data-open={p.id}>Review</button></div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel c6" id="stale">
                <div className="panel-h"><h2>Reporting compliance</h2><span className="sub">weekly update expected</span></div>
                <div className="queue queue-pm">
                  {props.stale.length === 0 && <span className="hint">All up to date</span>}
                  {props.stale.map((p) => (
                    <div className="qi" key={p.id}>
                      <div className="b">
                        <div className="qi-top"><span className="qi-proj"><span className={`qi-proj-icon ${p.upd > 14 ? "red" : "amb"}`}><Ic name="folder" /></span><span className="qi-proj-name">{p.name}</span></span><span className={`qi-status ${p.upd > 14 ? "red" : "amb"}`}>{p.upd}d ago</span></div>
                        <b className="qi-title">{p.phase} · {p.stage}</b>
                        <span className="qi-desc">{p.calcLabel} · PM {p.pmName}</span>
                      </div>
                      <div className="m"><button type="button" className="act-btn dark" data-open={p.id}>Chase</button></div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel c6" id="gates">
                <div className="panel-h"><h2>Gate approvals waiting on me</h2></div>
                <div className="queue queue-pm">
                  {props.gatesWaitingRows.length === 0 && <span className="hint">Nothing waiting</span>}
                  {props.gatesWaitingRows.map((g) => (
                    <div className="qi" key={g.id}>
                      <div className="b">
                        <div className="qi-top"><span className="qi-proj"><span className="qi-proj-icon violet"><Ic name="folder" /></span><span className="qi-proj-name">{g.name}</span></span><span className="qi-status violet">{g.since}</span></div>
                        <b className="qi-title">{g.gate}</b>
                        <span className="qi-desc">Submitted by {g.pmName} · readiness pack attached</span>
                      </div>
                      <div className="m"><button type="button" className="act-btn dark" data-open={g.id}>Review &amp; approve</button></div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel c6" id="escal">
                <div className="panel-h"><h2>Escalate upward</h2><span className="sub">appears on the Executive decisions list once sent</span></div>
                <div className="queue queue-pm">
                  {props.escalRows.length === 0 && <span className="hint">Nothing to escalate</span>}
                  {props.escalRows.map((e) => (
                    <div className="qi" key={e.id}>
                      <div className="b">
                        <div className="qi-top"><span className="qi-proj"><span className="qi-proj-icon red"><Ic name="folder" /></span><span className="qi-proj-name">{e.name}</span></span><span className="qi-status red">Escalate</span></div>
                        <b className="qi-title">{e.t}</b>
                      </div>
                      <div className="m"><button type="button" className="act-btn dark" data-open={e.id}>Escalate</button></div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="panel" id="head-tracker">
              <div className="panel-h">
                <h2>Stage-gate tracker</h2>
                <div className="sort">
                  <label htmlFor="pmFilter" style={{ marginRight: 2 }}>PM</label>
                  <select id="pmFilter" style={{ padding: "3px 26px 3px 8px", fontSize: 12 }} value={headPm} onChange={(e) => setHeadPm(e.target.value)}>
                    <option value="">All</option>
                    {props.pms.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                  </select>
                  <span style={{ marginLeft: 10 }}>Sort</span>
                  <button type="button" aria-pressed={headSort === "rag"} onClick={() => setHeadSort("rag")}>RAG, red first</button>
                  <button type="button" aria-pressed={headSort === "date"} onClick={() => setHeadSort("date")}>Target date</button>
                  <button type="button" aria-pressed={headSort === "stale"} onClick={() => setHeadSort("stale")}>Least recently updated</button>
                </div>
              </div>
              {props.buckets.map((g) => {
                const list = filtered.filter((r) => r.bucket === g.key).sort(sortFn);
                if (!list.length) return null;
                const gc = { done: 0, prog: 0, late: 0, block: 0, none: 0 } as Record<string, number>;
                for (const r of list) for (const s of r.gates) gc[s] = (gc[s] ?? 0) + 1;
                const gCollapsed = collapsed.has(g.key);
                const isExpanded = expanded.has(g.key);
                const shown = isExpanded ? list : list.slice(0, GROUP_LIMIT);
                const hidden = list.length - shown.length;
                return (
                  <div className="sgt-group" key={g.key}>
                    <div className="sgt-head">
                      <button className="sgt-toggle" type="button" aria-expanded={!gCollapsed} onClick={() => toggleGroup(g.key)}>
                        <span className={`sgt-count ${g.color}`}>{list.length} Project{list.length === 1 ? "" : "s"}</span><b>{g.label}</b>
                      </button>
                      <div className="leg sgt-leg"><span><b className="gate-count done">{gc.done}</b> Complete</span><span><b className="gate-count prog">{gc.prog}</b> In progress</span><span><b className="gate-count late">{gc.late}</b> Delayed</span><span><b className="gate-count block">{gc.block}</b> Blocked</span><span><b className="gate-count none">{gc.none}</b> Not started</span></div>
                    </div>
                    {!gCollapsed && (
                      <div className="tw sgt-tw">
                        <table className="sgt">
                          <thead><tr><th>Solution</th><th>PM</th><th>Priority</th><th>Stage</th>{props.gateLabels.map((l) => <th className="c" key={l}>{l}</th>)}<th>%</th><th>RAG (calc)</th><th>Target</th><th>Updated</th></tr></thead>
                          <tbody>
                            {shown.map((p) => (
                              <tr className="rowbtn" data-open={p.id} tabIndex={0} key={p.id}>
                                <td><span className="name">{p.name}</span><span className="desc">{p.desc}</span></td>
                                <td className="pmc">{p.pmInitials ? <span className="av" style={{ width: 22, height: 22, fontSize: 10 }}>{p.pmInitials}</span> : "—"}</td>
                                <td><span className={`prio ${p.prio}`}>{p.prio}</span></td>
                                <td><span className="name" style={{ fontWeight: 500 }}>{p.stage}</span><span className="desc">{p.phase}</span></td>
                                {p.gates.map((s, i) => <td className="c" key={i}><Gate g={s} /></td>)}
                                <td><span className="pct num"><span className="bar"><i style={{ width: `${p.pct}%` }} /></span>{p.pct}%</span></td>
                                <td><RagChipV3 r={p.calc} /> {p.dispute ? <span className="gap" title={`Reported ${RAG_LABEL[p.rep]}, calculated ${RAG_LABEL[p.calc]}`}>▲ {p.rep}→{p.calc}</span> : <span className="gap ok">{p.rep === p.calc ? "agrees" : "—"}</span>}</td>
                                <td className="num"><span className={`date ${p.targetPast ? "past" : ""}`}>{p.target}</span></td>
                                <td><span className={`fresh ${p.upd > 14 ? "stale" : p.upd > 7 ? "warn" : ""}`}>{p.upd > 90 ? "no updates" : `${p.upd}d ago`}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {(hidden > 0 || isExpanded) && (
                          <div className="sgt-more">
                            <button type="button" className="act-btn" onClick={() => toggleExpanded(g.key)}>
                              {isExpanded ? "Show fewer" : `View ${hidden} more`}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>

            <div className="row g12" id="head-insights">
              <section className="panel c6">
                <div className="panel-h"><h2>Resource conflicts</h2><span className="sub">next 4 weeks</span></div>
                <div className="rl rl-risk">
                  {props.conflicts.length === 0 && <span className="hint">None detected</span>}
                  {props.conflicts.map((c, i) => (
                    <div className="ri pm-risk-row" key={i}>
                      <div className="qi-proj"><span className={`qi-proj-icon ${c.sev === "R" ? "red" : "amb"}`}><Ic name="folder" /></span><span className="qi-proj-name">{c.who}</span></div>
                      <b className="ri-title">{c.title}</b>
                      <span className="ri-desc">{c.desc}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel c6">
                <div className="panel-h"><h2>Calculated RAG · approved portfolio · 8 weeks</h2></div>
                <TrendChart title="Projects by calculated RAG" weeks={props.trend.weeks} series={props.trend.series} />
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
