"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import "./pm-v3.css";

// The PM Delivery Cockpit, markup ported 1:1 from the approved artifact (share
// 4vzE7RvVgiXTtfNuodTL8R). All data arrives as serializable props mapped from real tenant
// data by the server wrapper (pm.tsx); project-drawer opens bubble to CockpitInteractive
// via [data-open].

export interface V3Project {
  id: string;
  name: string;
  calc: "G" | "A" | "R" | "N";
  rep: "G" | "A" | "R" | "N";
  phase: string;
  stage: string;
  pct: number;
  bucketShort: string;
  bucketTitle: string;
  dispute: boolean;
  nextLabel: string | null;
  nextDate: string | null; // pre-formatted "3 Sept 26"
  nextPast: boolean;
  upd: number; // days since update (999 = never)
  hasMarkets: boolean;
}

export interface V3QueueItem {
  k: "due" | "soon" | "flag" | "info";
  t: string;
  d: string;
  when: string;
  act: string;
  projectId: string;
  projectName: string;
}

export interface V3Risk { sev: "R" | "A"; t: string; meta: string; projectName: string; projectId: string }
export interface V3Market { name: string; flag: string; pct: number; gates: string[]; live: boolean }

export interface PmV3Props {
  viewer: { name: string; title: string; initials: string };
  briefLines: { emphasis: string; detail: string }[];
  generatedAt: string;
  projects: V3Project[];
  ragCounts: { R: number; A: number; G: number; N: number };
  stats: { overdueMilestones: number; gatesSoon: number; nextUp: string; disputes: number; openRisks: number; allocPct: number | null };
  queue: V3QueueItem[];
  risks: V3Risk[];
  collisions: string[];
  market: { projectName: string; rows: V3Market[]; gateLabels: string[] } | null;
}

export const RAG_LABEL: Record<string, string> = { G: "Green", A: "Amber", R: "Red", N: "Not rated" };

/** While mounted, the cockpit's section pane is the ONLY left nav (hides the app sidebar). */
export function useFullBleed() {
  useEffect(() => {
    document.body.classList.add("pmv3-full");
    return () => document.body.classList.remove("pmv3-full");
  }, []);
}

const ICONS: Record<string, string> = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h8A1.5 1.5 0 0 1 20 8.5v8A1.5 1.5 0 0 1 18.5 18h-14A1.5 1.5 0 0 1 3 16.5z"/>',
  alarm: '<circle cx="12" cy="13" r="7"/><path d="M12 9v4l3 2"/><path d="M5 3 3 5"/><path d="m19 3 2 2"/>',
  calcheck: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m9 15 2 2 4-4"/>',
  compare: '<path d="M7 3v6a3 3 0 0 0 3 3h7"/><path d="m14 9 3-3-3-3"/><path d="M17 21v-6a3 3 0 0 0-3-3H7"/><path d="m10 15-3 3 3 3"/>',
  shield: '<path d="M12 3l7 3v6c0 5-3.5 8.5-7 9-3.5-.5-7-4-7-9V6z"/><path d="M12 8v4"/><path d="M12 15h.01"/>',
  battery: '<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 10v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>',
  warn: '<path d="M12 3 2 20h20z"/><path d="M12 9v5"/><path d="M12 17h.01"/>',
  sparkle: '<path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5 19 19M19 5l-2.5 2.5M7.5 16.5 5 19"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="M4 12.5 9.5 18 20 6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 5 1.5 7 2 8H4c.5-1 2-3 2-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
};

export function Ic({ name }: { name: string }) {
  return (
    <svg
      className="ic"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? "" }}
    />
  );
}

export const kindColor = (k: string) => (k === "due" ? "red" : k === "soon" ? "amb" : k === "flag" ? "blue" : "violet");

export function RagChipV3({ r }: { r: string }) {
  return <span className={`rag ${r}`}>{RAG_LABEL[r] ?? "—"}</span>;
}
export function RagBarV3({ c }: { c: { R: number; A: number; G: number; N: number } }) {
  const t = c.R + c.A + c.G + c.N || 1;
  return (
    <div className="ragbar" role="img" aria-label={`Red ${c.R}, Amber ${c.A}, Green ${c.G}`}>
      {(["R", "A", "G", "N"] as const).filter((k) => c[k] > 0).map((k) => (
        <i key={k} className={k} style={{ flex: c[k] / t }} title={`${RAG_LABEL[k]} ${c[k]}`} />
      ))}
    </div>
  );
}
function RagAgree({ p }: { p: V3Project }) {
  return p.dispute ? (
    <span className="rag-flag alert" title={`Reported ${RAG_LABEL[p.rep]}, calculated ${RAG_LABEL[p.calc]}`}>
      <Ic name="warn" />RAG Alert<b className="rag-jump">{p.rep} → {p.calc}</b>
    </span>
  ) : (
    <span className="rag-flag ok"><Ic name="check" />RAG Agrees</span>
  );
}
function Updated({ upd }: { upd: number }) {
  return <span className={`fresh ${upd > 14 ? "stale" : upd > 7 ? "warn" : ""}`}>Last Updated: {upd > 90 ? "no updates" : `${upd}d ago`}</span>;
}
const gateGlyph: Record<string, { cls: string; ch: string; title: string }> = {
  done: { cls: "done", ch: "✓", title: "Complete" },
  prog: { cls: "prog", ch: "●", title: "In progress" },
  late: { cls: "late", ch: "!", title: "Delayed" },
  block: { cls: "block", ch: "✕", title: "Blocked" },
  none: { cls: "none", ch: "—", title: "Not started" },
};
export function Gate({ g }: { g: string }) {
  const v = gateGlyph[g] ?? gateGlyph.none;
  return <span className={`gate ${v.cls}`} title={v.title}>{v.ch}</span>;
}

export function PmV3({ viewer, briefLines, generatedAt, projects, ragCounts, stats, queue, risks, collisions, market }: PmV3Props) {
  useFullBleed();
  const { resolvedTheme, setTheme } = useTheme();
  const [activeNav, setActiveNav] = useState("pm-top");
  const [wqFilter, setWqFilter] = useState("");
  const [search, setSearch] = useState("");

  const jump = (id: string) => {
    setActiveNav(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const q = search.trim().toLowerCase();
  const shownProjects = q ? projects.filter((p) => `${p.name} ${p.stage} ${p.phase}`.toLowerCase().includes(q)) : projects;
  const visibleQueue = wqFilter ? queue.filter((i) => i.projectId === wqFilter) : queue;

  const NAV: { id: string; icon: string; label: string }[] = [
    { id: "pm-top", icon: "grid", label: "Overview" },
    { id: "pm-projects", icon: "folder", label: "My Projects" },
    { id: "pm-queue", icon: "list", label: "Work Queue" },
    { id: "pm-risks", icon: "warn", label: "Risks & Collisions" },
    ...(market ? [{ id: "pm-market", icon: "globe", label: "Market Rollout" }] : []),
  ];

  return (
    <div className="pmv3">
      <div style={{ display: "grid", gap: 20 }}>
        <div className="pm-headerbar">
          <div className="pm-hb-brand"><span className="pm-hb-logo"><Ic name="grid" /></span><b>Qubit</b></div>
          <div className="pm-hb-main">
            <h1>Dashboard</h1>
            <div className="pm-hb-search">
              <input type="search" placeholder="Search my projects…" aria-label="Search my projects" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="pm-hb-right">
              <button className="pm-hb-icon" type="button" aria-label="Toggle colour theme" title="Toggle colour theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>◐</button>
              <button className="pm-hb-icon" type="button" aria-label="Notifications" title="Notifications"><Ic name="bell" /></button>
              <div className="pm-hb-user">
                <span className="pm-hb-avatar">{viewer.initials}</span>
                <div className="pm-hb-usertext"><b>{viewer.name}</b><span>{viewer.title}</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="pm-shell">
          <nav className="pm-sidebar" aria-label="Dashboard sections">
            {NAV.map((n) => (
              <button key={n.id} type="button" className={activeNav === n.id ? "active" : undefined} onClick={() => jump(n.id)}>
                <Ic name={n.icon} /><span>{n.label}</span>
              </button>
            ))}
          </nav>

          <div className="pm-content">
            <div className="pm-toprow" id="pm-top">
              <section className="pm-hero">
                <div className="pm-hero-top">
                  <span className="pm-hero-tag"><Ic name="sparkle" />Daily Brief</span>
                  <span className="pm-hero-meta">Generated {generatedAt} today · {viewer.name}</span>
                </div>
                <div className="pm-hero-body">
                  {briefLines.map((l, i) => <p key={i}><b>{l.emphasis}</b> {l.detail}</p>)}
                </div>
                <p className="pm-hero-foot">Generated from status updates, gate records and RAID items — verify before acting.</p>
              </section>
              <div className="pm-statgrid">
                <div className="pm-stat"><div className="pm-stat-icon blue"><Ic name="folder" /></div><div className="v num">{projects.length}</div><div className="l">Projects owned</div><RagBarV3 c={ragCounts} /></div>
                <div className={`pm-stat ${stats.overdueMilestones ? "hot" : ""}`}><div className="pm-stat-icon red"><Ic name="alarm" /></div><div className="v num">{stats.overdueMilestones}</div><div className="l">Overdue milestones</div></div>
                <div className="pm-stat"><div className="pm-stat-icon amber"><Ic name="calcheck" /></div><div className="v num">{stats.gatesSoon}</div><div className="l">Gates & milestones ≤7d</div><div className="d">next: {stats.nextUp}</div></div>
                <div className="pm-stat"><div className="pm-stat-icon violet"><Ic name="compare" /></div><div className="v num">{stats.disputes}</div><div className="l">RAG disputes</div><div className="d">reported greener</div></div>
                <div className={`pm-stat ${stats.openRisks ? "hot" : ""}`}><div className="pm-stat-icon red"><Ic name="shield" /></div><div className="v num">{stats.openRisks}</div><div className="l">Open risks</div><div className="d">needing attention</div></div>
                {stats.allocPct != null && (
                  <div className="pm-stat"><div className="pm-stat-icon teal"><Ic name="battery" /></div><div className="v num">{stats.allocPct}%</div><div className="l">My allocation</div><div className="load"><i className={stats.allocPct > 100 ? "over" : undefined} style={{ width: `${(Math.min(stats.allocPct / 100, 1.3) / 1.3) * 100}%` }} /></div></div>
                )}
              </div>
            </div>

            <section className="panel" id="pm-projects">
              <div className="panel-h"><h2>My Projects</h2><span className="sub">Click a card for the status-report view</span></div>
              <div className="pm-minileg"><span><i className="dot G" />On track</span><span><i className="dot A" />Needs attention</span><span><i className="dot R" />At risk</span></div>
              <div className="strip">
                {shownProjects.map((p) => (
                  <button key={p.id} type="button" className={`pcard ${p.calc}`} data-open={p.id}>
                    <div className="t"><div className="t-main"><span className={`pcard-icon ${p.calc}`}><Ic name="folder" /></span><b>{p.name}</b></div><RagChipV3 r={p.calc} /></div>
                    <div className="st"><b>{p.phase}</b> · {p.stage} · {p.pct}%</div>
                    <div className="pcard-row"><span className="chip" title={p.bucketTitle}>{p.bucketShort}</span><RagAgree p={p} /></div>
                    <div className="foot"><span>{p.nextLabel ? <>{p.nextLabel} · <b className="num" style={{ color: p.nextPast ? "var(--red-ink)" : "inherit" }}>{p.nextDate}</b></> : "no milestone set"}</span></div>
                    <div className="pcard-updated"><Updated upd={p.upd} /></div>
                  </button>
                ))}
                {shownProjects.length === 0 && <span className="hint">No projects match “{search}”.</span>}
              </div>
            </section>

            <div className="row g12">
              <section className="panel c7" id="pm-queue">
                <div className="panel-h">
                  <h2>Work queue</h2>
                  <select aria-label="Filter work queue by project" value={wqFilter} onChange={(e) => setWqFilter(e.target.value)}>
                    <option value="">All</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="sub" style={{ margin: "-6px 0 12px" }}>{visibleQueue.length} items · merged across projects</div>
                <div className="queue queue-pm">
                  {visibleQueue.length === 0 && <span className="hint">No items for this filter</span>}
                  {visibleQueue.map((item, i) => (
                    <div className="qi" key={i}>
                      <div className="b">
                        <div className="qi-top">
                          <span className="qi-proj"><span className={`qi-proj-icon ${kindColor(item.k)}`}><Ic name="folder" /></span><span className="qi-proj-name">{item.projectName}</span></span>
                          <span className={`qi-status ${kindColor(item.k)}`}>{item.when}</span>
                        </div>
                        <b className="qi-title">{item.t}</b>
                        <span className="qi-desc">{item.d}</span>
                      </div>
                      <div className="m"><button type="button" className="act-btn dark" data-open={item.projectId}>{item.act}</button></div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="c5" id="pm-risks" style={{ display: "grid", gap: 18, alignContent: "start" }}>
                <section className="panel">
                  <div className="panel-h"><h2>Projects at risk</h2><span className="sub">by severity</span></div>
                  <div className="rl rl-risk">
                    {risks.length === 0 && <span className="hint">No open risks</span>}
                    {risks.map((r, i) => (
                      <div className="ri pm-risk-row" key={i}>
                        <div className="qi-proj"><span className={`qi-proj-icon ${r.sev === "R" ? "red" : "amb"}`}><Ic name="folder" /></span><span className="qi-proj-name">{r.projectName}</span></div>
                        <b className="ri-title">{r.t}</b>
                        <span className="ri-desc">{r.meta}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-h"><h2>Collisions across my projects</h2></div>
                  <div className="rl">
                    {collisions.length === 0 && <span className="hint">None this month</span>}
                    {collisions.map((c, i) => (
                      <div className="ri" key={i}><span className="sev A" /><div><b>{c}</b></div><div /></div>
                    ))}
                  </div>
                </section>
              </div>
            </div>

            {market && (
              <section className="panel" id="pm-market">
                <div className="panel-h">
                  <h2>{market.projectName} — market rollout</h2>
                  <div className="leg"><span><Gate g="done" /> Done</span><span><Gate g="prog" /> In progress</span><span><Gate g="none" /> Not started</span><span><span className="roll" /> Rollout pending</span><span><span className="roll live" /> Live</span></div>
                </div>
                <div className="tw sgt-tw">
                  <table className="mm sgt">
                    <thead><tr><th>Market</th>{market.gateLabels.map((c) => <th className="c" key={c}>{c}</th>)}<th className="c">Rollout</th></tr></thead>
                    <tbody>
                      {market.rows.map((m) => (
                        <tr key={m.name}>
                          <td>{m.flag} {m.name}<span className="pctl num">{m.pct}%</span></td>
                          {m.gates.map((g, gi) => <td className="c" key={gi}><Gate g={g} /></td>)}
                          <td className="c"><span className={`roll ${m.live ? "live" : ""}`} title={m.live ? "Live" : "Rollout pending"} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
