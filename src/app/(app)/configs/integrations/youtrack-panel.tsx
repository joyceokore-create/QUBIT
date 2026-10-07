"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Check, CircleAlert, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { CARD, CARD_BG, FOCUS, PRIMARY, QUIET, SECONDARY } from "@/lib/surface";

/**
 * Configs › Integrations › YouTrack — the redesigned module. One instance + one token per
 * tenant; projects are mapped to it by picking from the projects the token can read (no
 * key-typing). Two states on one page: CONNECT (test, then save) and CONNECTED (summary bar +
 * Projects / Status mapping / Sync settings / Activity). QUBIT only reads from YouTrack.
 */

// ── Shapes (JSON-serialised from src/server/integrations/youtrack.ts) ─────────────────

export interface StatusJson {
  connected: boolean;
  enabled: boolean;
  baseUrl: string | null;
  host: string | null;
  connectedUser: string | null;
  connectedName: string | null;
  tokenLast4: string | null;
  status: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  config: { stateMap?: Record<string, string>; syncIntervalMinutes?: number; firstImportSince?: string | null; archiveRemoved?: boolean };
}
export interface YtProjectJson {
  id: string;
  name: string;
  shortName: string;
}
export type MappingState = "ready" | "needs_review" | "not_mapped" | "no_access";
export interface RowJson {
  projectId: string;
  code: string;
  name: string;
  ytKey: string | null;
  sync: boolean;
  state: MappingState;
  suggestion: { key: string; name: string; reason: "name" | "key" } | null;
}
export interface MappingViewJson {
  status: StatusJson;
  ytProjects: YtProjectJson[];
  rows: RowJson[];
  counts: { all: number; ready: number; needsReview: number; notMapped: number; noAccess: number };
}

interface TestReport {
  ok: boolean;
  reachable: boolean;
  tokenValid: boolean;
  user: { login: string; fullName: string | null } | null;
  projectCount: number;
  looksLikePerson: boolean;
  message?: string;
}

// Mirrors TASK_STATUSES in src/server/project-tasks.ts (server-only); the server validates.
const TASK_STATUSES = ["NotStarted", "InProgress", "InReview", "InQA", "Completed"] as const;
const TASK_STATUS_LABEL: Record<(typeof TASK_STATUSES)[number], string> = {
  NotStarted: "To do",
  InProgress: "In progress",
  InReview: "In review",
  InQA: "In QA",
  Completed: "Done",
};
// Common YouTrack states to offer in the Status-mapping tab (the connector's defaults).
const COMMON_YT_STATES = ["Submitted", "Open", "In Progress", "In Review", "To Verify", "Fixed", "Verified", "Blocked"];

const INPUT = `h-10 w-full rounded-[8px] border border-[var(--input)] bg-background px-3 text-[13px] text-foreground focus:border-brand ${FOCUS}`;
const LABEL = "text-[12.5px] font-semibold text-[var(--ink2)]";
const HINT = "text-[11.5px] text-[var(--ink4)]";
const EYEBROW = "font-mono text-[10px] font-semibold uppercase tracking-[2px] text-[var(--ink4)]";
const API = "/api/configs/integrations/youtrack";

async function readJson<T>(res: Response): Promise<{ data?: T; error?: { message: string } }> {
  return (await res.json().catch(() => ({}))) as { data?: T; error?: { message: string } };
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const STATE_META: Record<MappingState, { label: string; color: string; bg: string }> = {
  ready: { label: "Ready", color: "var(--ok)", bg: "color-mix(in oklab, var(--ok) 12%, transparent)" },
  needs_review: { label: "Needs review", color: "var(--qinfo)", bg: "color-mix(in oklab, var(--qinfo) 12%, transparent)" },
  not_mapped: { label: "Not mapped", color: "var(--ink3)", bg: "var(--wash2)" },
  no_access: { label: "No access", color: "var(--bad)", bg: "color-mix(in oklab, var(--bad) 12%, transparent)" },
};

function StateBadge({ state }: { state: MappingState }) {
  const m = STATE_META[state];
  return (
    <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ color: m.color, background: m.bg }}>
      {m.label}
    </span>
  );
}

function SyncOffBanner({ connectedYet }: { connectedYet: boolean }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[10px] border px-4 py-3 text-[13px]" style={{ borderColor: "color-mix(in oklab, var(--warn) 40%, transparent)", background: "color-mix(in oklab, var(--warn) 8%, transparent)", color: "var(--ink2)" }}>
      <AlertTriangle className="mt-0.5 size-4 flex-none" style={{ color: "var(--warn)" }} />
      <span>
        <span className="font-semibold">Sync is off for this tenant.</span>{" "}
        {connectedYet ? "Mappings are saved and checked against YouTrack." : "You can connect and map projects now."} Nothing will sync until an
        admin turns on <code className="font-mono text-[12px]">FEATURE_YOUTRACK</code>.
      </span>
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────────────

export function YoutrackPanel({ initial }: { initial: MappingViewJson }) {
  const [view, setView] = useState<MappingViewJson>(initial);

  const refresh = useCallback(async () => {
    const res = await fetch(API, { cache: "no-store" });
    const j = await readJson<MappingViewJson>(res);
    if (res.ok && j.data) setView(j.data);
  }, []);

  if (!view.status.connected) return <ConnectScreen status={view.status} onConnected={refresh} />;
  return <ConnectedScreen view={view} refresh={refresh} />;
}

// ── Screen 1: Connect ────────────────────────────────────────────────────────────────

function ConnectScreen({ status, onConnected }: { status: StatusJson; onConnected: () => Promise<void> }) {
  const [baseUrl, setBaseUrl] = useState(status.baseUrl ?? "");
  const [token, setToken] = useState("");
  const [report, setReport] = useState<TestReport | null>(null);
  const [testedAt, setTestedAt] = useState<string | null>(null);
  const [acceptedPerson, setAcceptedPerson] = useState(false);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urlOk = /^https:\/\/.+/i.test(baseUrl.trim());
  const canTest = urlOk && token.trim().length > 0 && !busy;
  const canSave = report?.ok && (!report.looksLikePerson || acceptedPerson) && !busy;

  async function test() {
    setBusy("test");
    setError(null);
    setReport(null);
    const res = await fetch(`${API}/test`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ baseUrl: baseUrl.trim(), token: token.trim() }) });
    const j = await readJson<TestReport>(res);
    if (!res.ok || !j.data) setError(j.error?.message ?? "Could not test the connection.");
    else {
      setReport(j.data);
      setTestedAt(new Date().toISOString());
    }
    setBusy(null);
  }

  async function save() {
    setBusy("save");
    setError(null);
    const res = await fetch(`${API}/connect`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ baseUrl: baseUrl.trim(), token: token.trim() }) });
    const j = await readJson<StatusJson>(res);
    if (!res.ok) {
      setError(j.error?.message ?? "Could not save the connection.");
      setBusy(null);
      return;
    }
    await onConnected();
    setBusy(null);
  }

  const steps = ["Connect", "Map projects", "Sync settings"];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-[24px] font-bold tracking-[-.6px] text-[var(--qink)]">Connect YouTrack</h2>
        <p className="mt-1 text-[13px] text-[var(--ink3)]">Mirror issues from YouTrack into QUBIT projects. QUBIT only reads from YouTrack and never writes back.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <span
            key={s}
            className="rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold"
            style={i === 0 ? { background: "var(--qink)", color: "var(--cardbg)", borderColor: "var(--qink)" } : { borderColor: "var(--hair)", color: "var(--ink3)" }}
          >
            <span className="mr-1.5 font-mono text-[11px]">{i + 1}</span>
            {s}
          </span>
        ))}
      </div>

      {!status.enabled && <SyncOffBanner connectedYet={false} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className={`${CARD} p-6`} style={CARD_BG}>
          <h3 className="font-heading text-[17px] font-bold text-[var(--qink)]">Instance and token</h3>
          <p className={`mt-1 ${HINT}`}>One YouTrack instance per tenant. You map projects to it in the next step.</p>

          <div className="mt-5 flex flex-col gap-1.5">
            <label htmlFor="yt-url" className={LABEL}>Instance URL</label>
            <input id="yt-url" className={INPUT} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://your-org.youtrack.cloud" autoComplete="off" />
            <p className={HINT}>HTTPS only. The host must end in .youtrack.cloud or be on the allowlist your platform admin keeps.</p>
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor="yt-token" className={LABEL}>Permanent token</label>
            <input id="yt-token" type="password" className={INPUT} value={token} onChange={(e) => setToken(e.target.value)} placeholder="perm:… (read-only is enough)" autoComplete="off" />
            <p className={HINT}>Encrypted when saved. After that QUBIT shows only the last 4 characters. To change it, replace it.</p>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button type="button" className={PRIMARY} disabled={!canTest} onClick={() => void test()}>
              {busy === "test" ? "Testing…" : "Test connection"}
            </button>
            <button type="button" className={SECONDARY} onClick={() => { setToken(""); setReport(null); setError(null); }}>Cancel</button>
          </div>

          {error && <p role="alert" className="mt-3 text-[13px]" style={{ color: "var(--bad)" }}>{error}</p>}

          {report && (
            <div className="mt-6 border-t border-[var(--hair)] pt-5">
              <p className={EYEBROW}>Test result{testedAt ? ` · ${new Date(testedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
              <ul className="mt-3 flex flex-col gap-2 text-[13px] text-[var(--ink2)]">
                <ResultLine ok={report.reachable} label="Reachable" detail={report.reachable ? `${safeHost(baseUrl)} responded over HTTPS` : report.message ?? "no response"} />
                <ResultLine ok={report.tokenValid && Boolean(report.user)} label="Token valid" detail={report.user ? <>signed in as <code className="font-mono text-[12px]">{report.user.login}</code></> : report.message ?? "rejected"} />
                <ResultLine ok={report.ok} label="Projects visible" detail={report.ok ? `${report.projectCount} ${report.projectCount === 1 ? "project" : "projects"} this token can read` : "—"} />
              </ul>

              {report.ok && report.looksLikePerson && report.user && (
                <div className="mt-4 rounded-[10px] border px-4 py-3.5" style={{ borderColor: "color-mix(in oklab, var(--warn) 45%, transparent)", background: "color-mix(in oklab, var(--warn) 8%, transparent)" }}>
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-[var(--qink)]">
                    <CircleAlert className="size-4" style={{ color: "var(--warn)" }} /> This token belongs to a person, not a service user
                  </p>
                  <p className="mt-1.5 text-[12.5px] text-[var(--ink2)]">
                    If <code className="font-mono text-[12px]">{report.user.login}</code> leaves or loses access, sync stops, and everything the token does is logged under their name. Create a service user with the Observer role and use its token.
                  </p>
                  <div className="mt-2.5 flex items-center gap-4 text-[12.5px] font-semibold">
                    <a href="#recommended" className="underline" style={{ color: "var(--brand)" }}>How to create one</a>
                    <button type="button" className="underline" style={{ color: acceptedPerson ? "var(--ok)" : "var(--brand)" }} onClick={() => setAcceptedPerson(true)}>
                      {acceptedPerson ? "Continuing anyway (logged)" : "Continue anyway (logged)"}
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-5 flex justify-end">
                <button type="button" className={PRIMARY} disabled={!canSave} onClick={() => void save()}>
                  {busy === "save" ? "Saving…" : "Save and map projects →"}
                </button>
              </div>
            </div>
          )}
        </section>

        <aside id="recommended" className={`${CARD} p-6`} style={CARD_BG}>
          <p className={EYEBROW}>Recommended</p>
          <h3 className="mt-1.5 font-heading text-[17px] font-bold text-[var(--qink)]">Create a read-only token</h3>
          <p className={`mt-2 ${HINT}`}>YouTrack tokens can&apos;t be limited to read-only on their own. A token can do whatever its user can do, so the user is what you restrict.</p>
          <ol className="mt-4 flex flex-col gap-3 text-[13px] text-[var(--ink2)]">
            {[
              <>Create a user named <code className="font-mono text-[12px]">svc-qubit-readonly</code></>,
              <>Give it only the <b>Observer</b> role, only in the projects QUBIT should mirror</>,
              <>Sign in as that user, then go to Profile → Account security → New token</>,
              <>Set scope to <b>YouTrack</b> only. Leave out YouTrack Administration, Konnector and Mobile.</>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-6 flex-none items-center justify-center rounded-full bg-[var(--wash2)] font-mono text-[11px] font-semibold text-[var(--ink3)]">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className={`mt-5 border-t border-[var(--hair)] pt-4 ${HINT}`}>Each time QUBIT connects, the user is shown here so you can see which account it uses.</p>
        </aside>
      </div>
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function ResultLine({ ok, label, detail }: { ok: boolean; label: string; detail: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      {ok ? <Check className="mt-0.5 size-4 flex-none" style={{ color: "var(--ok)" }} /> : <CircleAlert className="mt-0.5 size-4 flex-none" style={{ color: "var(--bad)" }} />}
      <span><span className="font-semibold">{label}</span> · <span className="text-[var(--ink3)]">{detail}</span></span>
    </li>
  );
}

// ── Screen 2: Connected ──────────────────────────────────────────────────────────────

type Filter = "all" | "ready" | "needs_review" | "not_mapped" | "no_access";

function ConnectedScreen({ view, refresh }: { view: MappingViewJson; refresh: () => Promise<void> }) {
  const { status, ytProjects, rows, counts } = view;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [newToken, setNewToken] = useState("");

  async function act(label: string, fn: () => Promise<Response>, okMsg?: string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    const res = await fn();
    const j = await readJson<unknown>(res);
    if (!res.ok) setError(j.error?.message ?? `Could not ${label.toLowerCase()}.`);
    else {
      await refresh();
      if (okMsg) setNotice(okMsg);
    }
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-[24px] font-bold tracking-[-.6px] text-[var(--qink)]">YouTrack</h2>
        <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold" style={{ color: "var(--ok)", background: "color-mix(in oklab, var(--ok) 12%, transparent)" }}>
          <span className="size-1.5 rounded-full" style={{ background: "var(--ok)" }} /> Connected · read-only
        </span>
      </div>

      {!status.enabled && <SyncOffBanner connectedYet />}

      <section className={`${CARD} flex flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4`} style={CARD_BG}>
        <Fact label="Instance" value={status.host ?? "—"} />
        <Fact label="Signed in as" value={<code className="font-mono text-[12.5px]">{status.connectedUser ?? "—"}</code>} />
        <Fact label="Token" value={<code className="font-mono text-[12.5px]">···· {status.tokenLast4 ?? "????"}</code>} />
        <Fact label="Last checked" value={ago(status.lastCheckedAt)} />
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          <button type="button" className={SECONDARY} disabled={busy !== null} onClick={() => void act("Test again", () => fetch(`${API}/retest`, { method: "POST" }), "Connection re-tested.")}>
            {busy === "Test again" ? "Testing…" : "Test again"}
          </button>
          <button type="button" className={SECONDARY} disabled={busy !== null} onClick={() => setReplacing((v) => !v)}>Replace token</button>
          <button
            type="button"
            className={`${QUIET} text-[13px]`}
            style={{ color: "var(--bad)" }}
            disabled={busy !== null}
            onClick={() => { if (confirm("Disconnect YouTrack for this tenant? Project mappings are kept but stop syncing.")) void act("Disconnect", () => fetch(API, { method: "DELETE" })); }}
          >
            Disconnect
          </button>
        </div>
        {replacing && (
          <div className="flex w-full items-center gap-2 border-t border-[var(--hair)] pt-3">
            <input type="password" className={`${INPUT} max-w-[420px]`} value={newToken} onChange={(e) => setNewToken(e.target.value)} placeholder="New permanent token (re-tested before it is saved)" autoComplete="off" />
            <button type="button" className={PRIMARY} disabled={!newToken.trim() || busy !== null} onClick={() => void act("Replace token", () => fetch(`${API}/connect`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: newToken.trim() }) }), "Token replaced.").then(() => { setNewToken(""); setReplacing(false); })}>
              {busy === "Replace token" ? "Saving…" : "Save token"}
            </button>
          </div>
        )}
        {status.lastError && <p className="w-full text-[12.5px]" style={{ color: "var(--bad)" }}>Last check failed: {status.lastError}</p>}
        {error && <p role="alert" className="w-full text-[12.5px]" style={{ color: "var(--bad)" }}>{error}</p>}
        {notice && <p className="w-full text-[12.5px]" style={{ color: "var(--ok)" }}>{notice}</p>}
      </section>

      <Tabs defaultValue="projects" className="w-full">
        <TabsList>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="status">Status mapping</TabsTrigger>
          <TabsTrigger value="sync">Sync settings</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="projects"><ProjectsTab rows={rows} ytProjects={ytProjects} counts={counts} connectedUser={status.connectedUser} refresh={refresh} /></TabsContent>
        <TabsContent value="status"><StatusMappingTab status={status} refresh={refresh} /></TabsContent>
        <TabsContent value="sync"><SyncSettingsTab status={status} refresh={refresh} /></TabsContent>
        <TabsContent value="activity"><ActivityTab status={status} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={EYEBROW}>{label}</span>
      <span className="text-[13.5px] text-[var(--qink)]">{value}</span>
    </div>
  );
}

// ── Projects tab (mapping table) ─────────────────────────────────────────────────────

function ProjectsTab({ rows, ytProjects, counts, connectedUser, refresh }: { rows: RowJson[]; ytProjects: YtProjectJson[]; counts: MappingViewJson["counts"]; connectedUser: string | null; refresh: () => Promise<void> }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  // Pending edits keyed by projectId; absent = unchanged.
  const [draft, setDraft] = useState<Record<string, { ytKey: string | null; sync: boolean }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const effective = (r: RowJson) => draft[r.projectId] ?? { ytKey: r.ytKey, sync: r.sync };
  const changed = useMemo(() => rows.filter((r) => { const d = draft[r.projectId]; return d && (d.ytKey !== r.ytKey || d.sync !== r.sync); }), [rows, draft]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (filter === "all" || r.state === filter) && (!q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)));
  }, [rows, filter, search]);

  function setKey(r: RowJson, ytKey: string | null) {
    const cur = effective(r);
    setDraft((d) => ({ ...d, [r.projectId]: { ytKey, sync: ytKey ? (cur.sync || !r.ytKey) : false } }));
  }
  function setSync(r: RowJson, sync: boolean) {
    const cur = effective(r);
    setDraft((d) => ({ ...d, [r.projectId]: { ytKey: cur.ytKey, sync } }));
  }
  function autoMatch() {
    const next = { ...draft };
    for (const r of rows) if (!effective(r).ytKey && r.suggestion) next[r.projectId] = { ytKey: r.suggestion.key, sync: true };
    setDraft(next);
  }

  async function save() {
    if (!changed.length) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`${API}/mappings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mappings: changed.map((r) => ({ projectId: r.projectId, ...effective(r) })) }),
    });
    const j = await readJson<{ saved: number; errors: { projectId: string; message: string }[] }>(res);
    if (!res.ok) setError(j.error?.message ?? "Could not save the mappings.");
    else {
      setDraft({});
      await refresh();
      setNotice(`${j.data?.saved ?? 0} ${j.data?.saved === 1 ? "mapping" : "mappings"} saved${j.data?.errors.length ? ` · ${j.data.errors.length} failed` : ""}.`);
      if (j.data?.errors.length) setError(j.data.errors.map((e) => e.message).join(" "));
    }
    setBusy(false);
  }

  const chips: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "All", n: counts.all },
    { key: "ready", label: "Ready", n: counts.ready },
    { key: "needs_review", label: "Needs review", n: counts.needsReview },
    { key: "not_mapped", label: "Not mapped", n: counts.notMapped },
    { key: "no_access", label: "No access", n: counts.noAccess },
  ];
  const usedKeys = new Set(rows.map((r) => effective(r).ytKey).filter(Boolean));

  return (
    <section className={`${CARD} mt-3 overflow-hidden`} style={CARD_BG}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--hair)] px-5 py-4">
        <div>
          <h3 className="font-heading text-[16px] font-bold text-[var(--qink)]">Project mapping</h3>
          <p className={`mt-0.5 ${HINT}`}>Pick from the projects this token can see. You don&apos;t type keys. Saving checks each mapping against YouTrack.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={SECONDARY} onClick={autoMatch} disabled={busy}>Auto-match by name</button>
          <button type="button" className={PRIMARY} disabled={!changed.length || busy} onClick={() => void save()}>
            {busy ? "Saving…" : `Save ${changed.length} ${changed.length === 1 ? "change" : "changes"}`}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hair)] px-5 py-3">
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              className="rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors"
              style={filter === c.key ? { background: "var(--qink)", color: "var(--cardbg)", borderColor: "var(--qink)" } : { borderColor: "var(--hair)", color: "var(--ink3)" }}
            >
              {c.label} {c.n}
            </button>
          ))}
        </div>
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ink4)]" />
          <input className={`${INPUT} h-9 w-[240px] pl-8`} placeholder="Search projects" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {(error || notice) && (
        <div className="border-b border-[var(--hair)] px-5 py-2 text-[12.5px]">
          {error && <p role="alert" style={{ color: "var(--bad)" }}>{error}</p>}
          {notice && <p style={{ color: "var(--ok)" }}>{notice}</p>}
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className={`grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_140px_60px] gap-4 border-b border-[var(--hair)] px-5 py-2.5 ${EYEBROW}`}>
            <span>QUBIT project</span><span>YouTrack project</span><span>State</span><span className="text-right">Sync</span>
          </div>
          {visible.map((r) => {
            const e = effective(r);
            const dirty = Boolean(draft[r.projectId]);
            const rowTone = r.state === "no_access" ? "color-mix(in oklab, var(--bad) 4%, transparent)" : r.state === "needs_review" ? "color-mix(in oklab, var(--qinfo) 4%, transparent)" : "transparent";
            return (
              <div key={r.projectId} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_140px_60px] items-start gap-4 border-b border-[var(--hair2)] px-5 py-3.5 last:border-0" style={{ background: rowTone }}>
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-[var(--ink4)]">{r.code}</div>
                  <div className="truncate text-[13.5px] font-semibold text-[var(--qink)]">{r.name}</div>
                </div>
                <div className="min-w-0">
                  <select
                    className={`${INPUT} h-9`}
                    style={dirty ? { borderColor: "var(--brand)", borderStyle: "dashed" } : undefined}
                    value={e.ytKey ?? ""}
                    onChange={(ev) => setKey(r, ev.target.value || null)}
                    aria-label={`YouTrack project for ${r.code}`}
                  >
                    <option value="">Choose a YouTrack project</option>
                    {e.ytKey && !ytProjects.some((p) => p.shortName === e.ytKey) && <option value={e.ytKey}>{e.ytKey} · (not visible to this token)</option>}
                    {ytProjects.map((p) => (
                      <option key={p.shortName} value={p.shortName} disabled={usedKeys.has(p.shortName) && e.ytKey !== p.shortName}>
                        {p.shortName} · {p.name}
                      </option>
                    ))}
                  </select>
                  {!e.ytKey && r.suggestion && (
                    <div className="mt-2 flex items-center gap-2 text-[12px] text-[var(--ink3)]">
                      <span>Suggested from the project {r.suggestion.reason}</span>
                      <button type="button" className="rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold" style={{ borderColor: "var(--qinfo)", color: "var(--qinfo)" }} onClick={() => setKey(r, r.suggestion!.key)}>Accept</button>
                    </div>
                  )}
                  {r.state === "no_access" && r.ytKey && !dirty && (
                    <p className="mt-2 text-[12px]" style={{ color: "var(--bad)" }}>
                      {connectedUser ?? "This token"} can&apos;t read {r.ytKey} (403). In YouTrack, give it the Observer role in {r.ytKey}, then select Test again.
                    </p>
                  )}
                </div>
                <div><StateBadge state={dirty ? (e.ytKey ? "ready" : "not_mapped") : r.state} /></div>
                <div className="flex justify-end pt-1">
                  <Checkbox checked={e.sync} disabled={!e.ytKey} onCheckedChange={(v) => setSync(r, v === true)} aria-label={`Sync ${r.code}`} />
                </div>
              </div>
            );
          })}
          {visible.length === 0 && <p className="px-5 py-8 text-center text-[12.5px] text-[var(--ink5)]">No projects in this view.</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--hair)] px-5 py-3 text-[12px] text-[var(--ink4)]">
        <span>Showing {visible.length} of {rows.length} active {rows.length === 1 ? "project" : "projects"}</span>
        <span>A YouTrack project can map to only one QUBIT project.</span>
      </div>
    </section>
  );
}

// ── Status mapping tab ───────────────────────────────────────────────────────────────

function StatusMappingTab({ status, refresh }: { status: StatusJson; refresh: () => Promise<void> }) {
  const current = useMemo(() => status.config.stateMap ?? {}, [status.config.stateMap]);
  const states = useMemo(() => Array.from(new Set([...COMMON_YT_STATES, ...Object.keys(current)])), [current]);
  const [map, setMap] = useState<Record<string, string>>(() => Object.fromEntries(states.map((s) => [s, current[s] ?? current[s.toLowerCase()] ?? ""])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unmapped = states.filter((s) => !map[s]).length;

  async function save() {
    setBusy(true);
    setError(null);
    const stateMap = Object.fromEntries(Object.entries(map).filter(([, v]) => v));
    const res = await fetch(`${API}/settings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ stateMap }) });
    const j = await readJson<unknown>(res);
    if (!res.ok) setError(j.error?.message ?? "Could not save the status map.");
    else await refresh();
    setBusy(false);
  }

  return (
    <section className={`${CARD} mt-3 p-5`} style={CARD_BG}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-[16px] font-bold text-[var(--qink)]">Status mapping</h3>
          <p className={`mt-0.5 ${HINT}`}>Each YouTrack state needs a QUBIT task status, or RAG and progress will be wrong. Unmapped states fall back to the connector defaults.</p>
        </div>
        {unmapped > 0 && <span className="rounded-full px-3 py-1 text-[12px] font-semibold" style={{ color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 12%, transparent)" }}>{unmapped} {unmapped === 1 ? "state" : "states"} unmapped</span>}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {states.map((s) => (
          <label key={s} className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--hair)] px-3 py-2">
            <code className="font-mono text-[12.5px] text-[var(--ink2)]">{s}</code>
            <select className={`${INPUT} h-8 w-[160px]`} value={map[s] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [s]: e.target.value }))} aria-label={`QUBIT status for ${s}`}>
              <option value="">Not mapped</option>
              {TASK_STATUSES.map((t) => <option key={t} value={t}>{TASK_STATUS_LABEL[t]}</option>)}
            </select>
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-[12.5px]" style={{ color: "var(--bad)" }}>{error}</p>}
      <div className="mt-4 flex justify-end">
        <button type="button" className={PRIMARY} disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Map statuses"}</button>
      </div>
    </section>
  );
}

// ── Sync settings tab ────────────────────────────────────────────────────────────────

function SyncSettingsTab({ status, refresh }: { status: StatusJson; refresh: () => Promise<void> }) {
  const c = status.config;
  const [interval, setInterval_] = useState(String(c.syncIntervalMinutes ?? 15));
  const [since, setSince] = useState(c.firstImportSince ? c.firstImportSince.slice(0, 10) : "");
  const [archive, setArchive] = useState(c.archiveRemoved ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const body = {
      syncIntervalMinutes: Number(interval),
      firstImportSince: since ? new Date(`${since}T00:00:00Z`).toISOString() : null,
      archiveRemoved: archive,
    };
    const res = await fetch(`${API}/settings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await readJson<unknown>(res);
    if (!res.ok) setError(j.error?.message ?? "Could not save the sync settings.");
    else await refresh();
    setBusy(false);
  }

  return (
    <section className={`${CARD} mt-3 p-5`} style={CARD_BG}>
      <h3 className="font-heading text-[16px] font-bold text-[var(--qink)]">Sync settings</h3>
      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-[13px] sm:grid-cols-[180px_minmax(0,1fr)]">
        <dt className="text-[var(--ink3)]">Direction</dt><dd className="font-semibold text-[var(--qink)]">YouTrack → QUBIT only</dd>
        <dt className="text-[var(--ink3)]">How often</dt>
        <dd>
          <select className={`${INPUT} h-9 w-[260px]`} value={interval} onChange={(e) => setInterval_(e.target.value)} aria-label="Sync interval">
            {[5, 15, 30, 60, 180, 360, 720, 1440].map((m) => <option key={m} value={m}>Every {m < 60 ? `${m} minutes` : `${m / 60} hour${m / 60 === 1 ? "" : "s"}`}, only changed issues</option>)}
          </select>
        </dd>
        <dt className="text-[var(--ink3)]">First import</dt>
        <dd className="flex items-center gap-2">
          <input type="date" className={`${INPUT} h-9 w-[200px]`} value={since} onChange={(e) => setSince(e.target.value)} aria-label="Import issues updated since" />
          <span className={HINT}>{since ? "Issues updated since this date" : "Full history"}</span>
        </dd>
        <dt className="text-[var(--ink3)]">Removed in YouTrack</dt>
        <dd className="flex items-center gap-2">
          <Checkbox checked={archive} onCheckedChange={(v) => setArchive(v === true)} aria-label="Archive removed issues" />
          <span className="font-semibold text-[var(--qink)]">{archive ? "Archived in QUBIT, never deleted" : "Deleted in QUBIT"}</span>
        </dd>
      </dl>
      {error && <p role="alert" className="mt-3 text-[12.5px]" style={{ color: "var(--bad)" }}>{error}</p>}
      <div className="mt-4 flex justify-end">
        <button type="button" className={PRIMARY} disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save sync settings"}</button>
      </div>
    </section>
  );
}

// ── Activity tab ─────────────────────────────────────────────────────────────────────

function ActivityTab({ status }: { status: StatusJson }) {
  return (
    <section className={`${CARD} mt-3 p-5`} style={CARD_BG}>
      <h3 className="font-heading text-[16px] font-bold text-[var(--qink)]">Activity</h3>
      <ul className="mt-3 flex flex-col gap-2 text-[13px] text-[var(--ink2)]">
        <li className="flex items-center gap-2.5">
          {status.status === "error" ? <CircleAlert className="size-4" style={{ color: "var(--bad)" }} /> : <Check className="size-4" style={{ color: "var(--ok)" }} />}
          Connection {status.status === "error" ? "check failed" : "healthy"} · last checked {ago(status.lastCheckedAt)}
          {status.lastError && <span style={{ color: "var(--bad)" }}> · {status.lastError}</span>}
        </li>
        <li className={HINT}>Per-project sync runs are recorded on each project&apos;s integration (last sync, last error) and surface on the project workspace. A full sync log lands here next.</li>
      </ul>
    </section>
  );
}
