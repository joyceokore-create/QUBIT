"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import "./pm-v3.css";
import { Ic, RagChipV3, RagBarV3, RAG_LABEL, useFullBleed } from "./pm-v3";
import { TrendChart } from "./head-v3";

// Executive view — markup ported 1:1 from the approved artifact's renderExec().

export interface ExecRow {
  id: string;
  name: string;
  desc: string;
  sub: string;
  phase: string;
  stage: string;
  lpo: boolean;
  calc: "G" | "A" | "R" | "N";
  rep: "G" | "A" | "R" | "N";
  dispute: boolean;
  dims: Record<string, string>;
  target: string;
  targetPast: boolean;
  support: string;
  prio: string;
}

export interface ExecV3Props {
  briefLines: { emphasis: string; detail: string }[];
  generatedAt: string;
  stats: {
    all: number;
    approved: number;
    approvedCounts: { R: number; A: number; G: number; N: number };
    live: number;
    liveNames: string;
    blocked: number;
    decisions: number;
    decisionsOver30: number;
    glc: number;
    glcRed: number;
  };
  buckets: { label: string; n: number; color: string; names: string }[];
  stageGroups: { phase: string; names: string[] }[];
  prioGroups: { key: string; label: string; color: string }[];
  rows: ExecRow[];
  trendRep: { weeks: string[]; series: [number, number, number][] };
  trendCalc: { weeks: string[]; series: [number, number, number][] };
  decisions: { id: string; owner: string; age: string; sev: "R" | "A"; t: string; why: string }[];
  risks: { id: string; projectName: string; t: string; meta: string }[];
  glc: { a: string; o: string; s: string; rag: "G" | "A" | "R" | "N" }[];
}

const DIMS = ["Schedule", "Budget", "Scope", "Risk", "Resources", "Quality"];

export function ExecV3(props: ExecV3Props) {
  useFullBleed();
  const { resolvedTheme, setTheme } = useTheme();
  const [activeNav, setActiveNav] = useState("exec-top");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const GROUP_LIMIT = 5;
  const toggleExpanded = (key: string) => setExpanded((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const jump = (id: string) => { setActiveNav(id); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const toggleGroup = (key: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const q = search.trim().toLowerCase();
  const filtered = props.rows.filter((r) => !q || `${r.name} ${r.desc} ${r.sub} ${r.stage}`.toLowerCase().includes(q));
  const maxB = Math.max(1, ...props.buckets.map((b) => b.n));

  const NAV = [
    { id: "exec-top", icon: "grid", label: "Overview" },
    { id: "exec-pipeline", icon: "compare", label: "Pipeline" },
    { id: "exec-portfolio", icon: "folder", label: "Portfolio" },
    { id: "exec-insights", icon: "list", label: "Insights" },
    { id: "decisions", icon: "warn", label: "Decisions" },
    { id: "exec-glc", icon: "shield", label: "GLC" },
  ];

  return (
    <div className="pmv3">
      <div style={{ display: "grid", gap: 20 }}>
        <div className="pm-headerbar">
          <div className="pm-hb-brand"><span className="pm-hb-logo"><Ic name="grid" /></span><b>Qubit</b></div>
          <div className="pm-hb-main">
            <h1>Dashboard</h1>
            <div className="pm-hb-search"><input type="search" placeholder="Search all projects…" aria-label="Search all projects" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <div className="pm-hb-right">
              <button className="pm-hb-icon" type="button" aria-label="Toggle colour theme" title="Toggle colour theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>◐</button>
              <button className="pm-hb-icon" type="button" aria-label="Notifications" title="Notifications"><Ic name="bell" /></button>
              <div className="pm-hb-user"><span className="pm-hb-avatar">EX</span><div className="pm-hb-usertext"><b>Executive</b><span>Group Leadership Committee</span></div></div>
            </div>
          </div>
        </div>

        <div className="pm-shell">
          <nav className="pm-sidebar" aria-label="Dashboard sections">
            {NAV.map((n) => (
              <button key={n.id} type="button" className={activeNav === n.id ? "active" : undefined} onClick={() => jump(n.id)}><Ic name={n.icon} /><span>{n.label}</span></button>
            ))}
          </nav>
          <div className="pm-content">
            <div className="pm-toprow" id="exec-top">
              <section className="pm-hero">
                <div className="pm-hero-top">
                  <span className="pm-hero-tag"><Ic name="sparkle" />Daily Brief</span>
                  <span className="pm-hero-meta">Generated {props.generatedAt} today · Executive</span>
                </div>
                <div className="pm-hero-body">{props.briefLines.map((l, i) => <p key={i}><b>{l.emphasis}</b> {l.detail}</p>)}</div>
                <p className="pm-hero-foot">Generated from status updates, gate records and RAID items — verify before acting.</p>
              </section>
              <div className="pm-statgrid">
                <div className="pm-stat"><div className="pm-stat-icon blue"><Ic name="grid" /></div><div className="v num">{props.stats.all}</div><div className="l">Initiatives across the pipeline</div><div className="d">{props.stats.approved} approved & funded</div></div>
                <div className="pm-stat"><div className="pm-stat-icon teal"><Ic name="check" /></div><div className="v num">{props.stats.live}</div><div className="l">Solutions live in production</div><div className="d">{props.stats.liveNames || "—"}</div></div>
                <div className="pm-stat"><div className="pm-stat-icon violet"><Ic name="shield" /></div><div className="v num">{props.stats.approved}</div><div className="l">Approved portfolio RAG</div><RagBarV3 c={props.stats.approvedCounts} /></div>
                <div className="pm-stat"><div className="pm-stat-icon amber"><Ic name="compare" /></div><div className="v num">{props.stats.blocked}</div><div className="l">Initiatives blocked on dependencies</div><div className="d">open blockers recorded</div></div>
                <div className={`pm-stat ${props.stats.decisions ? "hot" : ""}`}><div className="pm-stat-icon red"><Ic name="warn" /></div><div className="v num">{props.stats.decisions}</div><div className="l">Decisions needing Group action</div><div className="d">{props.stats.decisionsOver30} older than 30 days</div></div>
                <div className="pm-stat"><div className="pm-stat-icon blue"><Ic name="list" /></div><div className="v num">{props.stats.glc}</div><div className="l">GLC actions tracked</div><div className="d">{props.stats.glcRed} red</div></div>
              </div>
            </div>

            <section className="panel" id="exec-pipeline">
              <div className="panel-h"><h2>Pipeline at a glance</h2><span className="sub">lifecycle bucket</span></div>
              <div className="pipeline-split">
                <div className="hbars">
                  {props.buckets.map((b) => (
                    <div key={b.label} style={{ display: "contents" }}>
                      <span className="lab">{b.label}</span>
                      <span className="trk" title={b.names || "—"}><i style={{ width: `${(b.n / maxB) * 100}%`, background: b.color }} /></span>
                      <span className="v num">{b.n}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Where the {props.stats.approved} approved projects stand</div>
                  <div className="stagecount">
                    {props.stageGroups.map((g) => (
                      <div className="sc" key={g.phase}><div className="v num">{g.names.length}</div><div className="l">{g.phase}</div><div className="n">{g.names.join(" · ")}</div></div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="panel" id="exec-portfolio">
              <div className="panel-h"><h2>Approved portfolio — status and support needed</h2><span className="sub">{props.stats.approved} funded projects · red first</span></div>
              {props.prioGroups.map((g) => {
                const list = filtered.filter((r) => r.prio === g.key);
                if (!list.length) return null;
                const gCollapsed = collapsed.has(g.key);
                const isExpanded = expanded.has(g.key);
                const shown = isExpanded ? list : list.slice(0, GROUP_LIMIT);
                const hidden = list.length - shown.length;
                return (
                  <div className="sgt-group" key={g.key}>
                    <div className="sgt-head">
                      <button className="sgt-toggle" type="button" aria-expanded={!gCollapsed} onClick={() => toggleGroup(g.key)}>
                        <span className={`sgt-count ${g.color}`}>{list.length} Project{list.length === 1 ? "" : "s"}</span><b>Priority: {g.label}</b>
                      </button>
                    </div>
                    {!gCollapsed && (
                      <div className="tw sgt-tw">
                        <table className="sgt">
                          <thead><tr><th>Solution</th><th>Subsidiary</th><th>Stage</th><th>LPO</th><th>RAG</th><th>Dimensions</th><th>Target</th><th>Support needed</th></tr></thead>
                          <tbody>
                            {shown.map((p) => (
                              <tr className="rowbtn" data-open={p.id} tabIndex={0} key={p.id}>
                                <td><span className="name">{p.name}</span><span className="desc">{p.desc}</span></td>
                                <td>{p.sub}</td>
                                <td><span className="name" style={{ fontWeight: 500 }}>{p.stage}</span><span className="desc">{p.phase}</span></td>
                                <td><span className={`prio ${p.lpo ? "Low" : "High"}`}>{p.lpo ? "Yes" : "No"}</span></td>
                                <td><RagChipV3 r={p.calc} /> {p.dispute ? <span className="gap" title={`Reported ${RAG_LABEL[p.rep]}, calculated ${RAG_LABEL[p.calc]}`}>▲ {p.rep}→{p.calc}</span> : <span className="gap ok">{p.rep === p.calc ? "agrees" : "—"}</span>}</td>
                                <td><span className="dims" title={DIMS.map((d) => `${d}: ${RAG_LABEL[p.dims[d]] ?? "—"}`).join(" · ")}>{DIMS.map((d) => <i key={d} className={p.dims[d] ?? "N"}>{d[0]}</i>)}</span></td>
                                <td className="num"><span className={`date ${p.targetPast ? "past" : ""}`}>{p.target}</span></td>
                                <td style={{ whiteSpace: "normal", maxWidth: "34ch", color: "var(--ink-2)" }}>{p.support || "—"}</td>
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

            <section className="panel" id="exec-insights">
              <div className="panel-h"><h2>RAG trend · approved portfolio</h2><span className="sub">reported vs calculated, same scale</span></div>
              <div className="ragtrend-row">
                <TrendChart title="As reported by PMs" weeks={props.trendRep.weeks} series={props.trendRep.series} muted />
                <TrendChart title="As calculated from gates & dates" weeks={props.trendCalc.weeks} series={props.trendCalc.series} muted />
              </div>
              <p className="hint" style={{ margin: "8px 0 0" }}>Reported vs calculated over the window — the gap is the portfolio-level sandbagging signal.</p>
            </section>

            <div className="row g12">
              <section className="panel c7" id="decisions">
                <div className="panel-h"><h2>Decisions waiting on the Group</h2><span className="sub">escalated by the Head of PMs · sorted by age</span></div>
                <div className="queue queue-pm">
                  {props.decisions.length === 0 && <span className="hint">No decisions pending</span>}
                  {props.decisions.map((d) => (
                    <div className="qi" key={d.id}>
                      <div className="b">
                        <div className="qi-top"><span className="qi-proj"><span className={`qi-proj-icon ${d.sev === "R" ? "red" : "amb"}`}><Ic name="folder" /></span><span className="qi-proj-name">{d.owner}</span></span><span className={`qi-status ${d.sev === "R" ? "red" : "amb"}`}>{d.age}</span></div>
                        <b className="qi-title">{d.t}</b>
                        <span className="qi-desc">{d.why}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel c5">
                <div className="panel-h"><h2>Top risks</h2><span className="sub">portfolio exposure</span></div>
                <div className="rl rl-risk">
                  {props.risks.length === 0 && <span className="hint">No open red risks</span>}
                  {props.risks.map((r, i) => (
                    <div className="ri pm-risk-row" key={i}>
                      <div className="qi-proj"><span className="qi-proj-icon red"><Ic name="folder" /></span><span className="qi-proj-name">{r.projectName}</span></div>
                      <b className="ri-title">{r.t}</b>
                      <span className="ri-desc">{r.meta}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="panel" id="exec-glc">
              <div className="panel-h"><h2>GLC actions</h2><span className="sub">Group Leadership Committee · owners abbreviated</span></div>
              <div className="tw sgt-tw">
                <table className="sgt">
                  <thead><tr><th>Action</th><th>Owner</th><th>Status</th><th>RAG</th></tr></thead>
                  <tbody>
                    {props.glc.length === 0 && <tr><td colSpan={4} className="hint" style={{ padding: "10px 8px" }}>No group actions tracked</td></tr>}
                    {props.glc.map((g, i) => (
                      <tr key={i}>
                        <td style={{ whiteSpace: "normal", maxWidth: "36ch", fontWeight: 600 }}>{g.a}</td>
                        <td style={{ whiteSpace: "normal", maxWidth: "20ch", color: "var(--ink-2)" }}>{g.o}</td>
                        <td style={{ whiteSpace: "normal", maxWidth: "48ch", color: "var(--ink-2)" }}>{g.s}</td>
                        <td><RagChipV3 r={g.rag} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
