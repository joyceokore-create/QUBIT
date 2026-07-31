"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Card {
  provider: string;
  name: string;
  monogram: string;
  description: string;
  feedsQ: string;
  resourceLabel: string;
  connected: boolean;
  resource: string | null;
  hasToken: boolean;
  live: boolean;
  config: { baseUrl?: string; fieldMap?: FieldMap } | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  syncIntervalMinutes: number;
}

type FieldMap = { state?: Record<string, string>; type?: Record<string, string>; priority?: Record<string, string> };

interface ConnectPayload {
  connected: boolean;
  resource?: string | null;
  token?: string;
  config?: { baseUrl: string; fieldMap?: FieldMap } | null;
}

const YOUTRACK = "youtrack";

// The taxonomy a mapping may target. Values are constrained here AND on the server (see
// integrations.ts) — the client check is only so the error arrives before the round trip.
const STATUSES = ["NotStarted", "InProgress", "InReview", "InQA", "Completed"];
const TYPES = ["Feature", "Bug", "Chore", "Spike", "Improvement"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];

/** "Ready for test = InQA" per line → { "ready for test": "InQA" }. Returns the first bad
 *  line instead of guessing, so a typo is visible rather than silently dropped. */
export function parseMapLines(text: string, allowed: string[]): { map: Record<string, string> } | { error: string } {
  const map: Record<string, string> = {};
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const at = line.lastIndexOf("=");
    if (at < 1) return { error: `"${line}" — write it as "YouTrack value = QUBIT value".` };
    const from = line.slice(0, at).trim().toLowerCase();
    const to = line.slice(at + 1).trim();
    if (!from) return { error: `"${line}" — the YouTrack value is missing.` };
    const match = allowed.find((a) => a.toLowerCase() === to.toLowerCase());
    if (!match) return { error: `"${to}" is not one of ${allowed.join(", ")}.` };
    map[from] = match;
  }
  return { map };
}

function toMapLines(map: Record<string, string> | undefined): string {
  return Object.entries(map ?? {}).map(([k, v]) => `${k} = ${v}`).join("\n");
}

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function IntegrationsGrid({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [connect, setConnect] = useState<Card | null>(null);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  // M7-B: the GitHub webhook secret, shown exactly ONCE after connect (it is stored
  // encrypted and can never be displayed again — reconnect to mint a fresh one).
  const [webhookSecretOnce, setWebhookSecretOnce] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/integrations`).then((r) => r.json());
    const list: Card[] = d.data ?? [];
    setCards(list);
    // Pull live summaries for connected providers that have a live connector.
    for (const c of list.filter((x) => x.connected && x.live && x.hasToken)) {
      fetch(`/api/projects/${projectId}/integrations/${c.provider}/status`)
        .then((r) => r.json())
        .then((s) => setStatuses((prev) => ({ ...prev, [c.provider]: s.summary?.headline ?? "Couldn’t sync — check the token" })))
        .catch(() => {});
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  const set = async (provider: string, body: ConnectPayload) => {
    const res = await fetch(`/api/projects/${projectId}/integrations/${provider}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const d = await res.json().catch(() => ({}));
      if (d.webhookSecretOnce) setWebhookSecretOnce(d.webhookSecretOnce);
      if (provider === "github" && !body.connected) setWebhookSecretOnce(null);
      void load();
    }
  };

  const syncNow = async (full: boolean) => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/youtrack/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ full }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSyncMsg(body?.error?.message ?? "Sync failed.");
      } else {
        const d = body.data as { created: number; updated: number; unchanged: number; unmatchedAssignees: string[]; truncated: boolean };
        const parts = [`${d.created} new`, `${d.updated} updated`, `${d.unchanged} unchanged`];
        if (d.unmatchedAssignees.length) parts.push(`${d.unmatchedAssignees.length} assignee(s) with no QUBIT account`);
        if (d.truncated) parts.push("more remaining — run again");
        setSyncMsg(parts.join(" · "));
      }
    } finally {
      setSyncing(false);
      void load();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {webhookSecretOnce && (
        <div className="flex flex-col gap-2 rounded-[12px] border p-3" style={{ borderColor: "color-mix(in oklab, var(--warn) 45%, transparent)", background: "color-mix(in oklab, var(--warn) 7%, transparent)" }}>
          <p className="text-[12px] font-semibold text-[var(--qink)]">
            GitHub webhook secret — copy it NOW; it is shown only once.
          </p>
          <p className="text-[11.5px] leading-[1.5] text-[var(--ink3)]">
            In the repo: Settings → Webhooks → Add webhook. Payload URL{" "}
            <code className="rounded bg-[var(--wash2)] px-1 font-mono text-[10.5px]">{`${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/github`}</code>
            , content type <code className="rounded bg-[var(--wash2)] px-1 font-mono text-[10.5px]">application/json</code>, events: just pushes.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[8px] bg-[var(--wash2)] px-2 py-1.5 font-mono text-[11px] text-[var(--qink)]">{webhookSecretOnce}</code>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(webhookSecretOnce)}
              className="rounded-[8px] border border-[var(--w12)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--ink2)] hover:border-brand hover:text-brand"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => setWebhookSecretOnce(null)}
              className="text-[11px] text-[var(--ink4)] underline-offset-2 hover:underline"
            >
              Done
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <div key={c.provider} className="flex flex-col gap-3 rounded-[16px] border border-[var(--w07)] bg-[var(--qcard)] p-[18px]">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-[var(--w06)] text-[11px] font-bold text-[var(--ink2)]">
              {c.monogram}
            </span>
            <span className="flex-1 text-[15px] rv:text-heading-xs font-bold text-[var(--qink)]">{c.name}</span>
            <span
              className="size-2.5 flex-none rounded-full"
              style={{ background: c.connected ? "var(--ok)" : "var(--w14)" }}
              title={c.connected ? "Connected" : "Not connected"}
            />
          </div>
          <p className="text-[12.5px] leading-[1.5] text-[var(--ink3)]">{c.description}</p>
          <div className="min-h-[16px] font-mono text-[11px] text-[var(--ink4)]">
            {c.connected ? statuses[c.provider] ?? c.resource ?? "Connected" : ""}
          </div>

          {c.provider === YOUTRACK && c.connected && (
            <div className="flex flex-col gap-1.5 rounded-[10px] bg-[var(--w04)] p-2.5">
              <div className="text-[11px] text-[var(--ink4)]">
                Last sync: {relTime(c.lastSyncAt)} · every {c.syncIntervalMinutes}m
              </div>
              {c.lastSyncError && (
                <div className="text-[11px] font-medium text-[var(--bad)]">{c.lastSyncError}</div>
              )}
              {syncMsg && <div className="text-[11px] text-[var(--ink3)]">{syncMsg}</div>}
              {canEdit && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={() => void syncNow(false)}
                    className="flex items-center gap-1 rounded-[8px] border border-[var(--w12)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink2)] hover:border-brand hover:text-brand disabled:opacity-50"
                  >
                    <RefreshCw className={`size-3 ${syncing ? "animate-spin" : ""}`} /> Sync now
                  </button>
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={() => void syncNow(true)}
                    title="Re-read every issue, not just those changed since the last sync — use after changing the field mapping."
                    className="text-[11px] text-[var(--ink4)] underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    Full re-sync
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mt-auto flex items-center gap-3">
            {canEdit ? (
              c.connected ? (
                <>
                  <button
                    type="button"
                    onClick={() => set(c.provider, { connected: false, resource: null })}
                    className="rounded-[9px] border border-[var(--w12)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--ink2)] hover:border-brand hover:text-brand"
                  >
                    Disconnect
                  </button>
                  {c.provider === YOUTRACK && (
                    <button
                      type="button"
                      onClick={() => setConnect(c)}
                      className="text-[12px] font-semibold text-[var(--ink3)] underline-offset-2 hover:text-brand hover:underline"
                    >
                      Settings
                    </button>
                  )}
                </>
              ) : (
                <Button type="button" onClick={() => setConnect(c)} className="h-8 px-3.5 text-[12px]">
                  Connect
                </Button>
              )
            ) : (
              <span className="text-[11px] text-[var(--ink5)]">{c.connected ? "Connected" : "Not connected"}</span>
            )}
            <span className="text-[11px] text-[var(--ink5)]">Feeds Q: {c.feedsQ}</span>
          </div>
        </div>
      ))}

      </div>
      {connect && (
        <ConnectDialog
          card={connect}
          onClose={() => setConnect(null)}
          onConnect={async (payload) => {
            await set(connect.provider, payload);
            setConnect(null);
          }}
        />
      )}
    </div>
  );
}

function ConnectDialog({
  card,
  onClose,
  onConnect,
}: {
  card: Card;
  onClose: () => void;
  onConnect: (payload: ConnectPayload) => void;
}) {
  const isYoutrack = card.provider === YOUTRACK;
  const [resource, setResource] = useState(card.resource ?? "");
  const [token, setToken] = useState("");
  const [baseUrl, setBaseUrl] = useState(card.config?.baseUrl ?? "");
  const [stateMap, setStateMap] = useState(toMapLines(card.config?.fieldMap?.state));
  const [typeMap, setTypeMap] = useState(toMapLines(card.config?.fieldMap?.type));
  const [priorityMap, setPriorityMap] = useState(toMapLines(card.config?.fieldMap?.priority));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const payload: ConnectPayload = {
      connected: true,
      resource: resource.trim() || null,
      token: token.trim() || undefined,
    };
    if (isYoutrack) {
      if (!baseUrl.trim()) return setError("The YouTrack instance URL is required.");
      if (!card.hasToken && !token.trim()) return setError("A permanent token is required.");
      const state = parseMapLines(stateMap, STATUSES);
      if ("error" in state) return setError(`State mapping: ${state.error}`);
      const type = parseMapLines(typeMap, TYPES);
      if ("error" in type) return setError(`Type mapping: ${type.error}`);
      const priority = parseMapLines(priorityMap, PRIORITIES);
      if ("error" in priority) return setError(`Priority mapping: ${priority.error}`);
      payload.config = {
        baseUrl: baseUrl.trim().replace(/\/+$/, ""),
        fieldMap: { state: state.map, type: type.map, priority: priority.map },
      };
    }
    onConnect(payload);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {card.connected ? `${card.name} settings` : `Connect ${card.name}`}
          </DialogTitle>
          <DialogDescription>
            {isYoutrack
              ? "Issues from this YouTrack project are mirrored onto the board. QUBIT never writes back to YouTrack."
              : `Link this project to ${card.name} — Q uses it for ${card.feedsQ}.`}
            {card.live ? "" : " (Live sync for this provider is coming; this saves the connection.)"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto">
          {isYoutrack && (
            <>
              <label className="text-sm font-medium text-ink-2">Instance URL</label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://yourcompany.youtrack.cloud"
                autoFocus
              />
            </>
          )}
          <label className="text-sm font-medium text-ink-2">{card.resourceLabel}</label>
          <Input
            value={resource}
            onChange={(e) => setResource(e.target.value)}
            placeholder={card.resourceLabel}
            autoFocus={!isYoutrack}
          />
          {card.live && (
            <>
              <label className="text-sm font-medium text-ink-2">
                {isYoutrack ? "Permanent token" : "Access token"}
                {card.hasToken && <span className="ml-1.5 font-normal text-ink-4">(leave blank to keep the current one)</span>}
              </label>
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={isYoutrack ? "perm:… (read-only)" : "Fine-grained PAT (read-only)"}
              />
              <p className="text-xs text-ink-3">
                Stored encrypted at rest; used server-side only. Read access is enough — nothing is written back.
              </p>
            </>
          )}
          {isYoutrack && (
            <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--w07)] p-3">
              <p className="text-xs text-ink-3">
                Field mapping — one <span className="font-mono">YouTrack value = QUBIT value</span> per line. Stock
                YouTrack workflows already map correctly; add lines only where yours differs.
              </p>
              <MapField label={`State → ${STATUSES.join(" | ")}`} value={stateMap} onChange={setStateMap} placeholder="Ready for test = InQA" />
              <MapField label={`Type → ${TYPES.join(" | ")}`} value={typeMap} onChange={setTypeMap} placeholder="Change request = Improvement" />
              <MapField label={`Priority → ${PRIORITIES.join(" | ")}`} value={priorityMap} onChange={setPriorityMap} placeholder="P1 = Critical" />
            </div>
          )}
          {error && <p className="text-xs font-medium text-[var(--bad)]">{error}</p>}
          <div className="flex justify-end">
            <Button type="button" onClick={submit}>
              {card.connected ? "Save" : "Connect"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MapField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.5px] text-ink-4">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="rounded-[8px] border border-[var(--w12)] bg-transparent p-2 font-mono text-[11.5px] text-[var(--qink)] outline-none focus:border-brand"
      />
    </label>
  );
}
