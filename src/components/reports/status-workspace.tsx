"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileText, Loader2, Send } from "lucide-react";
import { isoWeekId, isoWeekMonday, shiftIsoWeek, weekRange } from "@/lib/iso-week";
import { FOCUS, INPUT, PRIMARY, SECONDARY } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { resolveDelivery, type DeliveryCatalog } from "@/lib/status-report-delivery";
import { PageHeader } from "@/components/list/page-header";
import { FilterSelect, FilterToggle, ListToolbar, SearchField } from "@/components/list/list-toolbar";
import { ListEmpty } from "@/components/list/table-footer";
import { Banner, Panel } from "@/components/ui/panel";
import { Drawer } from "@/components/ui/drawer";
import { TextLink } from "@/components/ui/text-link";
import { UpdateCard, type CardNotice } from "@/components/reports/update-card";
import { StatusUploadDrawer, type UploadResult } from "@/components/reports/status-upload-drawer";
import { applyRowFor, baseCard, diffCard, mkey, readStage, WEIGHT, type ApplyRow, type Card, type Preview, type PreviewRow, type StatusWorkspaceJson, type WorkspaceProject, ratingReasonMissing } from "@/components/reports/status-workspace-model";

export type { StatusWorkspaceJson } from "@/components/reports/status-workspace-model";

/**
 * Reports › Weekly Update — the weekly update workspace (design spec v2: page header with
 * Upload Status Report + Confirm & Send All, then a two-column grid of project cards). One
 * card per project the viewer runs, prefilled from QUBIT: the line for the Head and its
 * status, the stage, EVERY gate on the Product build track (per scope: the product, or one
 * market's copy), every channel's state per market, and each market's own check-in — all
 * editable in place. A status report (Word, Excel, PDF, PowerPoint) only prefills the cards,
 * through the Upload drawer. Save Draft writes a card (POST …/status-upload/apply); Confirm
 * & Send writes it and sends the line to the Head (…/checkin; a closed week's apply sends).
 */

type WeekMode = "this" | "last" | "custom";
type Busy = null | { kind: "load" } | { kind: "card"; id: string; action: "save" | "send" } | { kind: "saveAll" } | { kind: "sendAll"; done: number; total: number };
type ApplyRowPayload = ReturnType<typeof applyRowFor>;
interface ResultRow extends ApplyRow {
  /** Sent to the Head by Confirm & Send (the apply only drafted it). */
  sent?: boolean;
  sendError?: string;
}

const weekLabel = (w: string) => `Week ${Number(w.split("-W")[1])} · ${weekRange(isoWeekMonday(w))}`;
const cityOf = (tz: string) => tz.split("/").pop()!.replace(/_/g, " ");

export function StatusWorkspace({ initial, uploadHint = false, timeZone, tenantName }: { initial: StatusWorkspaceJson; uploadHint?: boolean; timeZone: string; tenantName: string }) {
  const router = useRouter();
  const [ws, setWs] = useState<StatusWorkspaceJson>(initial);
  const [weekMode, setWeekMode] = useState<WeekMode>("this");
  const [customDate, setCustomDate] = useState("");
  const thisWeek = isoWeekId(new Date());
  const week = weekMode === "this" ? thisWeek : weekMode === "last" ? shiftIsoWeek(thisWeek, -1) : customDate ? isoWeekId(new Date(`${customDate}T12:00:00Z`)) : null;
  const bases = useMemo(() => Object.fromEntries(ws.projects.map((p) => [p.catalog.projectId, baseCard(p)])), [ws]);
  const [cards, setCards] = useState<Record<string, Card>>(() => Object.fromEntries(ws.projects.map((p) => [p.catalog.projectId, baseCard(p)])));
  const [file, setFile] = useState<Preview | null>(null);
  const [placedCount, setPlacedCount] = useState(0);
  const [attach, setAttach] = useState(true);
  const [attachedTo, setAttachedTo] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [notices, setNotices] = useState<Record<string, CardNotice>>({});
  const [teaching, setTeaching] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(uploadHint);
  const [drawerKey, setDrawerKey] = useState(0);

  const patch = (id: string, fn: (c: Card) => Card) => setCards((all) => ({ ...all, [id]: fn(all[id]!) }));

  /** The clarifier: re-read a card's stage line (typed, or answered by the PM). */
  const rereadStage = (id: string, stageGateName?: string | null, stage?: string) =>
    setCards((all) => {
      const p = ws.projects.find((x) => x.catalog.projectId === id)!;
      const c = { ...all[id]!, ...(stage !== undefined ? { stage } : {}), ...(stageGateName !== undefined ? { stageGateName } : {}) };
      return { ...all, [id]: readStage(p, bases[id]!, c, c.stageGateName).card };
    });

  /** Teach QUBIT a phrase → gate, tenant-wide, and re-read every card's stage with it. */
  async function teach(id: string, term: string, gateName: string | null) {
    setTeaching(term);
    setError(null);
    const res = await fetch("/api/reports/status-upload/stage-terms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ term, gateName }) });
    const body = await res.json().catch(() => null);
    setTeaching(null);
    if (!res.ok) {
      setError(body?.error?.message ?? "Could not save the phrase.");
      return;
    }
    const saved = body.data as { term: string; gateName: string | null };
    setWs((w) => ({
      ...w,
      projects: w.projects.map((p) => ({ ...p, catalog: { ...p.catalog, stageTerms: [...(p.catalog.stageTerms ?? []).filter((t) => t.term !== saved.term), ...(saved.gateName ? [{ term: saved.term, gateName: saved.gateName }] : [])] } })),
    }));
    // The answer is now the reading itself.
    setCards((all) => ({ ...all, [id]: { ...all[id]!, stageGateName: undefined } }));
  }

  const fetchWorkspace = async (w: string): Promise<StatusWorkspaceJson | null> => {
    const res = await fetch(`/api/reports/status-upload/workspace?week=${w}`);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.data) {
      setError(body?.error?.message ?? "Could not load your projects.");
      return null;
    }
    return body.data as StatusWorkspaceJson;
  };

  /** Reload the workspace for a week and rebase every card. */
  async function load(w: string) {
    setBusy({ kind: "load" });
    setError(null);
    setResults(null);
    setNotices({});
    const next = await fetchWorkspace(w);
    setBusy(null);
    if (!next) return;
    setWs(next);
    setCards(Object.fromEntries(next.projects.map((p) => [p.catalog.projectId, baseCard(p)])));
    setFile(null);
    setAttachedTo(new Set());
  }
  useEffect(() => {
    if (week && week !== ws.isoWeek) void load(week);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  /** Reload, rebasing only the cards just written — every other card keeps its edits.
   * `keepLine`: a closed week's Save Draft leaves the line for Confirm & Send. */
  async function refreshCards(ids: string[], keepLine = false) {
    const next = await fetchWorkspace(ws.isoWeek);
    if (!next) return;
    setWs(next);
    setCards((all) => {
      const out = { ...all };
      for (const p of next.projects) {
        const id = p.catalog.projectId;
        if (!out[id] || ids.includes(id)) {
          const fresh = baseCard(p);
          const old = all[id];
          out[id] = keepLine && old ? { ...fresh, narrative: old.narrative, rag: old.rag, resend: old.resend } : fresh;
        }
      }
      return out;
    });
  }

  /** Lay a parsed row onto a project's card (the file's values, every change shown). */
  function mergeRow(row: PreviewRow, projectId: string, orgUnitId: string | null, project: WorkspaceProject) {
    const market = orgUnitId ? (project.catalog.markets.find((m) => m.orgUnitId === orgUnitId) ?? null) : null;
    const plan = resolveDelivery(row, project.catalog, { market });
    patch(projectId, (c) => {
      const next: Card = { ...c, gates: { ...c.gates }, modules: { ...c.modules }, markets: { ...c.markets }, fromFile: { ...c.fromFile }, sources: [...c.sources, ...row.sections] };
      const tag = row.project;
      if (market) {
        if (row.update) next.markets[market.orgUnitId] = { rag: row.status ?? c.markets[market.orgUnitId]?.rag ?? "Amber", narrative: row.update };
        next.fromFile[`market:${market.orgUnitId}`] = tag;
      } else {
        if (row.update) {
          next.narrative = row.update;
          next.fromFile.narrative = tag;
        }
        if (row.status) {
          next.rag = row.status;
          next.fromFile.rag = tag;
        }
        if (row.stage) {
          next.stage = row.stage;
          next.fromFile.stage = tag;
        }
        if (project.product.alreadySent) next.resend = true;
      }
      const scope = market ? market.orgUnitId : "-";
      for (const g of plan.gates) {
        if (!market && plan.stage) next.stageSet.push(`-:${g.checkpointId}`);
        if (g.backwards) continue; // a stale file never undoes progress by reflex — the PM can still set it by hand
        next.gates[scope] = { ...next.gates[scope], [g.checkpointId]: g.to };
        next.fromFile[`gate:${scope}:${g.checkpointId}`] = g.source;
      }
      for (const m of plan.modules) {
        if (m.backwards) continue;
        const k = mkey(m.moduleId, m.orgUnitId);
        next.modules[k] = { state: m.to, note: m.note ?? next.modules[k]?.note ?? null };
        next.fromFile[`module:${k}`] = m.source;
      }
      if (market) next.scope = market.orgUnitId;
      return next;
    });
  }

  /** "Create it as a new project" from the drawer: the card exists before Apply to Update. */
  async function createProject(name: string): Promise<{ id: string } | { error: string }> {
    const res = await fetch("/api/reports/status-upload/create-project", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: body?.error?.message ?? "Could not create the project." };
    const catalog = body.data.catalog as DeliveryCatalog;
    const project: WorkspaceProject = { catalog, product: { status: "None", narrative: "", computedRag: "Green", ragOverride: null, statusNote: "", alreadySent: false }, markets: [] };
    setWs((w) => ({ ...w, projects: [...w.projects, project].sort((a, b) => a.catalog.name.localeCompare(b.catalog.name)) }));
    setCards((all) => ({ ...all, [catalog.projectId]: baseCard(project) }));
    return { id: catalog.projectId };
  }

  /** "Apply to Update": prefill the cards from the reviewed file, then the PM's answers. */
  async function applyUpload(r: UploadResult) {
    setDrawerOpen(false);
    setFile(r.preview);
    setAttach(r.attach);
    setAttachedTo(new Set());
    setPlacedCount(r.placements.length);
    setResults(null);
    for (const pl of r.placements) {
      const project = ws.projects.find((x) => x.catalog.projectId === pl.projectId);
      if (project) mergeRow(pl.row, pl.projectId, pl.orgUnitId, project);
    }
    for (const a of r.answers) rereadStage(a.projectId, a.gateName);
    for (const a of r.answers) for (const term of a.remember) await teach(a.projectId, term, a.gateName);
  }

  const diffs = useMemo(() => Object.fromEntries(ws.projects.map((p) => [p.catalog.projectId, diffCard(p, cards[p.catalog.projectId] ?? bases[p.catalog.projectId]!, bases[p.catalog.projectId]!)])), [ws, cards, bases]);
  const saveableOf = (id: string) => diffs[id]!.count - (ws.past && diffs[id]!.product ? 1 : 0);
  const changed = ws.projects.filter((p) => saveableOf(p.catalog.projectId) > 0);
  const canSendCard = (p: WorkspaceProject) => {
    const c = cards[p.catalog.projectId]!;
    return Boolean(c.narrative.trim()) && (!p.product.alreadySent || c.resend) && !ratingReasonMissing(p, c);
  };
  const ready = ws.projects.filter(canSendCard);
  const visible = ws.projects.filter((p) => (!onlyChanged || diffs[p.catalog.projectId]!.count > 0) && (!query || `${p.catalog.code} ${p.catalog.name}`.toLowerCase().includes(query.toLowerCase())));
  const backwards = changed.some((p) => diffs[p.catalog.projectId]!.gates.some((g) => WEIGHT[g.to] < WEIGHT[g.from]));

  /** One apply call (drafts lines this week; a closed week's lines are sent). */
  async function postApply(rows: ApplyRowPayload[]): Promise<{ ok: true; data: ApplyRow[] } | { ok: false; message: string }> {
    const withFile = Boolean(file && attach && rows.some((r) => !attachedTo.has(r.projectId)));
    const res = await fetch("/api/reports/status-upload/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        week: ws.isoWeek,
        preparedBy: file?.preparedBy ?? null,
        reportDate: file?.reportDate ?? null,
        rows,
        ...(withFile && file ? { file: { name: file.fileName, format: file.format, base64: file.base64 } } : {}),
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: body?.error?.message ?? "Could not save." };
    const data = body.data as ApplyRow[];
    const attachedNow = data.filter((r) => r.attached).map((r) => r.projectId);
    if (attachedNow.length) setAttachedTo((s) => new Set([...s, ...attachedNow]));
    return { ok: true, data };
  }

  /** This week's Confirm & Send: confirm the line (with its status) and send it to the Head. */
  async function sendCheckin(p: WorkspaceProject): Promise<string | null> {
    const c = cards[p.catalog.projectId]!;
    // The PM's own reason for a rating they chose; the file is the reason for one it set.
    const reason = (file && c.fromFile.rag ? `From the status report ${file.fileName}` : c.ratingReason.trim()).slice(0, 300);
    const res = await fetch(`/api/projects/${p.catalog.projectId}/checkin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ narrative: c.narrative.trim(), ...(c.rag !== p.product.computedRag ? { ragOverride: c.rag, overrideReason: reason } : {}) }),
    });
    const d = await res.json().catch(() => null);
    return res.ok && d?.data ? null : (d?.error?.message ?? "Could not send");
  }

  const noticeFor = (r: ApplyRow | undefined, fallback: string): CardNotice =>
    !r
      ? { tone: "ok", text: fallback }
      : r.outcome === "error"
        ? { tone: "bad", text: r.message ?? "Could not save" }
        : r.outcome === "skipped"
          ? { tone: "warn", text: r.message ?? "Skipped" }
          : r.problems?.length
            ? { tone: "warn", text: `Saved, but: ${r.problems.join(" · ")}` }
            : { tone: "ok", text: r.outcome === "drafted" ? "Draft saved" : r.outcome === "sent" ? "Sent to the Head" : r.outcome === "resent" ? "Resent to the Head" : fallback };

  async function saveCard(id: string) {
    const p = ws.projects.find((x) => x.catalog.projectId === id)!;
    if (ratingReasonMissing(p, cards[id]!)) {
      setNotices((n) => ({ ...n, [id]: { tone: "bad", text: "Say why your rating differs from QUBIT's (at least 5 characters)." } }));
      return;
    }
    const row = applyRowFor(p, cards[id]!, diffs[id]!);
    if (ws.past) row.narrative = "";
    setBusy({ kind: "card", id, action: "save" });
    setError(null);
    const out = await postApply([row]);
    if (!out.ok) {
      setNotices((n) => ({ ...n, [id]: { tone: "bad", text: out.message } }));
      setBusy(null);
      return;
    }
    const r = out.data.find((x) => x.projectId === id);
    setNotices((n) => ({ ...n, [id]: noticeFor(r, "Saved") }));
    await refreshCards([id], ws.past);
    setBusy(null);
    router.refresh();
  }

  async function sendCard(id: string) {
    const p = ws.projects.find((x) => x.catalog.projectId === id)!;
    if (ratingReasonMissing(p, cards[id]!)) {
      setNotices((n) => ({ ...n, [id]: { tone: "bad", text: "Say why your rating differs from QUBIT's (at least 5 characters)." } }));
      return;
    }
    const d = diffs[id]!;
    setBusy({ kind: "card", id, action: "send" });
    setError(null);
    let notice: CardNotice = { tone: "ok", text: "Sent to the Head" };
    if (ws.past || p.product.alreadySent) {
      // A closed week's apply sends; a sent week's apply resends (Replace ticked).
      const out = await postApply([applyRowFor(p, cards[id]!, d, true)]);
      notice = out.ok ? noticeFor(out.data.find((x) => x.projectId === id), "Sent to the Head") : { tone: "bad", text: out.message };
    } else {
      const out = d.count > 0 ? await postApply([applyRowFor(p, cards[id]!, d)]) : null;
      const r = out?.ok ? out.data.find((x) => x.projectId === id) : undefined;
      if (out && !out.ok) notice = { tone: "bad", text: out.message };
      else if (r?.outcome === "error") notice = { tone: "bad", text: r.message ?? "Could not save" };
      else {
        const err = await sendCheckin(p);
        notice = err ? { tone: "bad", text: err } : r?.problems?.length ? { tone: "warn", text: `Sent, but: ${r.problems.join(" · ")}` } : notice;
      }
    }
    setNotices((n) => ({ ...n, [id]: notice }));
    if (notice.tone !== "bad") await refreshCards([id]);
    setBusy(null);
    router.refresh();
  }

  async function saveAll() {
    if (changed.length === 0) return;
    const missing = changed.filter((p) => ratingReasonMissing(p, cards[p.catalog.projectId]!));
    if (missing.length) {
      setError(`Say why your rating differs for ${missing.map((p) => p.catalog.name).join(", ")}.`);
      return;
    }
    setBusy({ kind: "saveAll" });
    setError(null);
    const rows = changed.map((p) => {
      const row = applyRowFor(p, cards[p.catalog.projectId]!, diffs[p.catalog.projectId]!);
      if (ws.past) row.narrative = "";
      return row;
    });
    const out = await postApply(rows);
    if (!out.ok) {
      setError(out.message);
      setBusy(null);
      return;
    }
    setResults(out.data);
    setNotices((n) => ({ ...n, ...Object.fromEntries(out.data.map((r) => [r.projectId, noticeFor(r, "Saved")])) }));
    await refreshCards(rows.map((r) => r.projectId), ws.past);
    setBusy(null);
    router.refresh();
  }

  /** Confirm & Send All: save every changed card, then send every card that is ready. */
  async function sendAll() {
    const missing = ws.projects.filter((p) => saveableOf(p.catalog.projectId) > 0 && ratingReasonMissing(p, cards[p.catalog.projectId]!));
    if (missing.length) {
      setError(`Say why your rating differs for ${missing.map((p) => p.catalog.name).join(", ")}.`);
      return;
    }
    const readyIds = new Set(ready.map((p) => p.catalog.projectId));
    const rows: ApplyRowPayload[] = [];
    for (const p of ws.projects) {
      const id = p.catalog.projectId;
      const isReady = readyIds.has(id);
      // A closed week (and a sent week being replaced) sends through the apply itself.
      const viaApply = isReady && (ws.past || p.product.alreadySent);
      if (viaApply) rows.push(applyRowFor(p, cards[id]!, diffs[id]!, true));
      else if (saveableOf(id) > 0) {
        const row = applyRowFor(p, cards[id]!, diffs[id]!);
        if (ws.past) row.narrative = "";
        rows.push(row);
      }
    }
    const toCheckin = ws.past ? [] : ready.filter((p) => !p.product.alreadySent);
    setBusy({ kind: "sendAll", done: 0, total: toCheckin.length + (rows.length ? 1 : 0) });
    setError(null);
    let applied: ResultRow[] = [];
    if (rows.length) {
      const out = await postApply(rows);
      if (!out.ok) {
        setError(out.message);
        setBusy(null);
        return;
      }
      applied = out.data;
    }
    let done = rows.length ? 1 : 0;
    const total = toCheckin.length + done;
    setBusy({ kind: "sendAll", done, total });
    const res: ResultRow[] = [...applied];
    for (const p of toCheckin) {
      const id = p.catalog.projectId;
      const prior = res.find((r) => r.projectId === id);
      if (prior?.outcome === "error") continue;
      const err = await sendCheckin(p);
      const row: ResultRow = prior ?? { projectId: id, code: p.catalog.code, outcome: "none", attached: false };
      if (err) row.sendError = err;
      else row.sent = true;
      if (!prior) res.push(row);
      done++;
      setBusy({ kind: "sendAll", done, total });
    }
    setResults(res);
    setNotices((n) => ({
      ...n,
      ...Object.fromEntries(res.map((r) => [r.projectId, r.sendError ? { tone: "bad" as const, text: r.sendError } : r.sent ? { tone: "ok" as const, text: "Sent to the Head" } : noticeFor(r, "Saved")])),
    }));
    await refreshCards(res.map((r) => r.projectId));
    setBusy(null);
    router.refresh();
  }

  const locked = busy !== null;
  const due = ws.past ? "week closed: lines are sent when you confirm them" : `due Fri 17:00, ${cityOf(timeZone)} time`;
  const sendAllLabel = busy?.kind === "sendAll" ? `Sending ${Math.min(busy.done + 1, busy.total)} of ${busy.total}…` : "Confirm & Send All";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={
          <Link href="/reports" className={cn("rounded-[4px] hover:text-[var(--ds-ink)]", FOCUS)}>
            Reports
          </Link>
        }
        title="Weekly Update"
        description={week ? `${weekLabel(week)} · ${due}` : "Pick a date in the week to update"}
        actions={
          <>
            <button
              type="button"
              onClick={() => {
                setDrawerKey((k) => k + 1);
                setDrawerOpen(true);
              }}
              disabled={locked || !week}
              className={SECONDARY}
            >
              <FileText className="size-3.5" aria-hidden /> Upload Status Report
            </button>
            <button type="button" onClick={() => void sendAll()} disabled={locked || ready.length === 0} className={PRIMARY} title={ready.length ? `Sends ${ready.length} ${ready.length === 1 ? "card" : "cards"} with a line for the Head` : "No card has a line ready to send"}>
              <Send className="size-3.5" aria-hidden /> {sendAllLabel}
            </button>
          </>
        }
      />

      <ListToolbar label="Find a project and pick the week">
        <SearchField value={query} onChange={setQuery} placeholder="Search your projects or codes" label="Search your projects" />
        <FilterSelect
          label="Week"
          allLabel="This week"
          value={weekMode === "this" ? "" : weekMode}
          options={[
            { value: "last", label: "Last week" },
            { value: "custom", label: "An earlier week" },
          ]}
          onChange={(v) => setWeekMode((v || "this") as WeekMode)}
        />
        {weekMode === "custom" && <input type="date" value={customDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setCustomDate(e.target.value)} aria-label="A date in the week" className={INPUT} />}
        <FilterToggle label="Changed Only" pressed={onlyChanged} onChange={setOnlyChanged} count={changed.length || undefined} />
        {busy?.kind === "load" && <Loader2 className="size-4 animate-spin text-[var(--ds-ink3)]" aria-label="Loading the week" />}
      </ListToolbar>

      {error && (
        <p role="alert" className="text-[12.5px] font-semibold text-[var(--ds-bad-text)]">
          {error}
        </p>
      )}

      {file && (
        <Banner>
          Prefilled from <b>{file.fileName}</b> · {placedCount} of {file.rows.length} {file.rows.length === 1 ? "line" : "lines"} placed · {attach ? "the file is attached to each project you save or send" : "the file is not attached"}
        </Banner>
      )}

      {results && results.length > 0 && (
        <Panel title="Saved and Sent" action={<TextLink href="/reports">Reports › This Week</TextLink>}>
          <ul className="m-0 flex list-none flex-col p-0">
            {results.map((r) => {
              const p = ws.projects.find((x) => x.catalog.projectId === r.projectId);
              const line = r.sendError
                ? r.sendError
                : r.sent
                  ? "line sent to the Head"
                  : r.outcome === "drafted"
                    ? "line drafted, send it from This Week or here"
                    : r.outcome === "resent"
                      ? "line replaced and resent to the Head"
                      : r.outcome === "sent"
                        ? "line sent to the Head"
                        : r.outcome === "none"
                          ? null
                          : r.message;
              const bad = Boolean(r.sendError) || r.outcome === "error";
              return (
                <li key={r.projectId} className="flex flex-wrap items-center gap-x-2 border-b border-dotted border-[var(--ds-line)] py-2 text-[12.5px] text-[var(--ds-ink3)] last:border-b-0">
                  <b className="font-semibold text-[var(--ds-ink)]">{p?.catalog.name ?? r.code}</b>
                  {line && <span className={bad ? "text-[var(--ds-bad-text)]" : r.outcome === "skipped" ? "text-[var(--ds-warn-text)]" : "text-[var(--ds-ok-text)]"}>{line}</span>}
                  {r.markets && <span>· {r.markets}</span>}
                  {r.gates && <span>· gates: {r.gates}</span>}
                  {r.modules && <span>· channels: {r.modules}</span>}
                  {r.attached && <span>· report attached</span>}
                  {r.problems?.map((x) => (
                    <span key={x} className="text-[var(--ds-bad-text)]">
                      · {x}
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {visible.length === 0 ? (
        <Panel>
          <ListEmpty
            filtered={ws.projects.length > 0}
            noun="projects"
            onClear={() => {
              setQuery("");
              setOnlyChanged(false);
            }}
            hint={ws.projects.length === 0 ? "Projects you run appear here each week, drafted from the board and the markets." : undefined}
          />
        </Panel>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {visible.map((p) => {
            const id = p.catalog.projectId;
            return (
              <UpdateCard
                key={id}
                p={p}
                c={cards[id]!}
                base={bases[id]!}
                d={diffs[id]!}
                past={ws.past}
                busy={busy?.kind === "card" && busy.id === id ? busy.action : null}
                locked={locked}
                notice={notices[id]}
                tenantName={tenantName}
                teaching={teaching}
                onPatch={(fn) => patch(id, fn)}
                onStage={(gate, stage) => rereadStage(id, gate, stage)}
                onTeach={(term, gate) => void teach(id, term, gate)}
                onSave={() => void saveCard(id)}
                onSend={() => void sendCard(id)}
              />
            );
          })}
        </div>
      )}

      {changed.length > 0 && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-[var(--ds-radius-card)] border border-[var(--ds-bd)] bg-[var(--ds-card)] px-[18px] py-3 shadow-[var(--ds-shadow)]">
          <span className="text-[12.5px] text-[var(--ds-ink2)]">
            {changed.length} {changed.length === 1 ? "project has" : "projects have"} unsaved changes
          </span>
          {backwards && (
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--ds-warn-text)]">
              <AlertTriangle className="size-3.5" aria-hidden /> some gates move backwards
            </span>
          )}
          <button type="button" onClick={() => void saveAll()} disabled={locked} className={cn(SECONDARY, "ml-auto")}>
            {busy?.kind === "saveAll" ? "Saving…" : "Save All Drafts"}
          </button>
        </div>
      )}

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} wide>
        {drawerOpen && <StatusUploadDrawer key={drawerKey} week={week} weekLabel={week ? weekLabel(week) : ""} projects={ws.projects} tenantName={tenantName} onCreateProject={createProject} onApply={(r) => void applyUpload(r)} onClose={() => setDrawerOpen(false)} />}
      </Drawer>
    </div>
  );
}
