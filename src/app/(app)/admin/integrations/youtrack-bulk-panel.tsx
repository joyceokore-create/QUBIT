"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Unplug } from "lucide-react";
import { LocalTime } from "@/components/reports/local-time";
import { parseCodeKeyList } from "@/lib/youtrack-paste";
import { CARD, FOCUS, PRIMARY, QUIET, SECONDARY } from "@/lib/surface";

/**
 * Admin › Integrations — the bulk YouTrack connect. One instance URL and one token for
 * the whole batch, a YouTrack project key per QUBIT project, and "sync right after" on by
 * default because YouTrack's answer is the only real proof the three fit together. A paste
 * box fills the keys from a `code,key` list. Re-runnable: leave the token blank to keep
 * each project's stored one.
 */

export interface ConnectionRowJson {
  projectId: string;
  code: string;
  name: string;
  connected: boolean;
  resource: string | null;
  hasToken: boolean;
  baseUrl: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

interface BulkRow {
  projectId: string;
  code: string;
  outcome: "connected" | "error";
  message?: string;
  synced?: { created: number; updated: number; unchanged: number; skipped: number };
}

const INPUT = `h-9 rounded-[8px] border border-[var(--input)] bg-background px-3 text-[13px] text-foreground focus:border-brand ${FOCUS}`;
const LABEL = "text-[11.5px] font-semibold text-[var(--ink4)]";

export function YoutrackBulkPanel({ enabled, initialRows }: { enabled: boolean; initialRows: ConnectionRowJson[] }) {
  const router = useRouter();
  const [rows] = useState(initialRows);
  const [baseUrl, setBaseUrl] = useState(initialRows.find((r) => r.baseUrl)?.baseUrl ?? "");
  const [token, setToken] = useState("");
  const [syncNow, setSyncNow] = useState(true);
  const [keys, setKeys] = useState<Record<string, string>>(() => Object.fromEntries(initialRows.map((r) => [r.projectId, r.resource ?? ""])));
  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<"connect" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, BulkRow>>({});

  const anyStoredToken = rows.some((r) => r.hasToken);
  // Rows that will be sent: a key is filled, and it is new, changed, or not yet connected.
  const toConnect = useMemo(
    () => rows.filter((r) => keys[r.projectId]?.trim() && (!r.connected || keys[r.projectId]!.trim() !== (r.resource ?? ""))),
    [rows, keys],
  );
  const needsToken = !token.trim() && toConnect.some((r) => !r.hasToken);

  function applyPaste() {
    const { pairs, errors } = parseCodeKeyList(paste);
    const byCode = new Map(rows.map((r) => [r.code.toUpperCase(), r.projectId]));
    const unknown: string[] = [];
    const next = { ...keys };
    for (const p of pairs) {
      const id = byCode.get(p.code);
      if (id) next[id] = p.key;
      else unknown.push(p.code);
    }
    setKeys(next);
    const applied = pairs.length - unknown.length;
    setPasteNote(
      [`${applied} ${applied === 1 ? "key" : "keys"} filled in`, unknown.length ? `unknown codes: ${unknown.join(", ")}` : null, errors.length ? `${errors.length} line${errors.length === 1 ? "" : "s"} skipped (line ${errors.map((e) => e.line).join(", ")})` : null]
        .filter(Boolean)
        .join(" · "),
    );
  }

  async function connect() {
    setBusy("connect");
    setError(null);
    const res = await fetch("/api/admin/integrations/youtrack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        baseUrl: baseUrl.trim(),
        ...(token.trim() ? { token: token.trim() } : {}),
        syncNow,
        rows: toConnect.map((r) => ({ projectId: r.projectId, project: keys[r.projectId]!.trim() })),
      }),
    });
    const body = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      setError(body?.error?.message ?? "Could not connect.");
      return;
    }
    setResults(Object.fromEntries((body.data as BulkRow[]).map((r) => [r.projectId, r])));
    setToken("");
    router.refresh();
  }

  async function disconnect(projectId: string) {
    setBusy("disconnect");
    setError(null);
    const res = await fetch("/api/admin/integrations/youtrack", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectIds: [projectId] }) });
    setBusy(null);
    if (!res.ok) {
      setError("Could not disconnect.");
      return;
    }
    setResults((prev) => {
      const { [projectId]: _gone, ...rest } = prev;
      return rest;
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {!enabled && (
        <p role="alert" className="rounded-[10px] px-3.5 py-2.5 text-[12.5px]" style={{ color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 10%, transparent)" }}>
          YouTrack mirroring is turned off for this deployment (FEATURE_YOUTRACK). You can store connections, but nothing will sync until it is on.
        </p>
      )}

      <section className={`${CARD} flex flex-col gap-3.5 p-4`} style={{ background: "var(--cardbg)" }} aria-labelledby="yt-shared">
        <h2 id="yt-shared" className="text-[14px] font-bold text-[var(--qink)]">
          YouTrack · one instance, one token, a key per project
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="yt-url" className={LABEL}>
              Instance URL
            </label>
            <input id="yt-url" type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://yourcompany.youtrack.cloud" className={INPUT} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="yt-token" className={LABEL}>
              Permanent token {anyStoredToken && <span className="font-normal text-[var(--ink5)]">· blank keeps each project&apos;s stored token</span>}
            </label>
            <input id="yt-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="perm:… (read-only is enough)" className={INPUT} />
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
            <label htmlFor="yt-paste" className={LABEL}>
              Fill keys from a list · one <code className="font-mono text-[10.5px]">code,key</code> per line
            </label>
            <textarea id="yt-paste" rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"KEZA,KZ\nSWIPE-KE,SWK"} className="w-full rounded-[8px] border border-[var(--input)] bg-background p-2.5 font-mono text-[11.5px]" />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={applyPaste} disabled={!paste.trim()} className={SECONDARY}>
                Fill keys
              </button>
              {pasteNote && <span className="text-[11.5px] text-[var(--ink4)]">{pasteNote}</span>}
            </div>
          </div>
          <label className="flex items-center gap-2 pt-6 text-[12.5px] text-[var(--ink2)]">
            <input type="checkbox" checked={syncNow} onChange={(e) => setSyncNow(e.target.checked)} className="size-3.5 accent-[var(--brand)]" />
            Sync right after connecting <span className="text-[var(--ink5)]">(proves the URL, token and key)</span>
          </label>
        </div>
      </section>

      <section className={`${CARD} overflow-hidden`} style={{ background: "var(--cardbg)" }} aria-labelledby="yt-table">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--hair)] p-[12px_16px]">
          <h2 id="yt-table" className="text-[13.5px] font-bold text-[var(--qink)]">
            Projects
          </h2>
          <span className="text-[11.5px] text-[var(--ink4)]">{rows.length} active</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {error && (
              <span role="alert" className="text-[12px] text-[var(--bad)]">
                {error}
              </span>
            )}
            <button
              type="button"
              onClick={() => void connect()}
              disabled={busy !== null || toConnect.length === 0 || !baseUrl.trim() || needsToken}
              title={needsToken ? "Enter the token — some of these projects have none stored" : !baseUrl.trim() ? "Enter the instance URL" : undefined}
              className={PRIMARY}
            >
              <Link2 className="size-3.5" aria-hidden /> {busy === "connect" ? "Connecting…" : `Connect ${toConnect.length} ${toConnect.length === 1 ? "project" : "projects"}`}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="font-mono text-[9px] font-bold uppercase tracking-[1px] text-[var(--ink4)]">
                <th className="border-b border-[var(--hair)] px-4 py-2">Project</th>
                <th className="border-b border-[var(--hair)] px-4 py-2">YouTrack project key</th>
                <th className="border-b border-[var(--hair)] px-4 py-2">Status</th>
                <th className="border-b border-[var(--hair)] px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const result = results[r.projectId];
                return (
                  <tr key={r.projectId} className="border-b border-[var(--hair2)] last:border-0">
                    <td className="px-4 py-2 align-top">
                      <span className="font-mono text-[11px] font-semibold text-[var(--ink3)]">{r.code}</span>
                      <span className="ml-2 text-[var(--qink)]">{r.name}</span>
                    </td>
                    <td className="px-4 py-2 align-top">
                      <input
                        value={keys[r.projectId] ?? ""}
                        onChange={(e) => setKeys((k) => ({ ...k, [r.projectId]: e.target.value }))}
                        placeholder="e.g. KZ"
                        aria-label={`YouTrack project key for ${r.code}`}
                        className={`${INPUT} h-8 w-[160px]`}
                      />
                    </td>
                    <td className="px-4 py-2 align-top text-[12px]">
                      {result ? (
                        result.outcome === "connected" ? (
                          <span style={{ color: "var(--ok)" }}>
                            Connected{result.synced ? ` · synced ${result.synced.created + result.synced.updated + result.synced.unchanged} issues` : ""}
                          </span>
                        ) : (
                          <span style={{ color: "var(--bad)" }}>{result.message}</span>
                        )
                      ) : r.connected ? (
                        <span className="text-[var(--ink2)]">
                          Connected · {r.lastSyncAt ? <>synced <LocalTime iso={r.lastSyncAt} format="date-time" /></> : "never synced"}
                          {r.lastSyncError && <span style={{ color: "var(--bad)" }}> · {r.lastSyncError}</span>}
                          {!r.hasToken && <span style={{ color: "var(--warn)" }}> · no token</span>}
                        </span>
                      ) : (
                        <span className="text-[var(--ink5)]">Not connected</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right align-top">
                      {r.connected && (
                        <button type="button" onClick={() => void disconnect(r.projectId)} disabled={busy !== null} className={`${QUIET} inline-flex items-center gap-1`} aria-label={`Disconnect YouTrack from ${r.code}`}>
                          <Unplug className="size-3.5" aria-hidden /> Disconnect
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-[12px] text-[var(--ink5)]">
                    No active projects.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
