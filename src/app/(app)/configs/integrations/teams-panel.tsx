"use client";

import { useState } from "react";
import { Loader2, Plug } from "lucide-react";
import { Banner, Panel } from "@/components/ui/panel";
import { Field, Kv } from "@/components/ui/drawer";
import { Chip } from "@/components/ui/status-pill";
import { INPUT, PRIMARY, QUIET } from "@/lib/surface";

/**
 * Configs › Integrations › Microsoft Teams. Paste a channel's webhook URL (Teams Workflows:
 * "Post to a channel when a webhook request is received", or a legacy incoming webhook);
 * QUBIT posts a test message before saving and never shows the URL again. When the Head
 * approves the week's roll-up, its managerial summary is posted to that channel.
 */

export interface TeamsStatusJson {
  connected: boolean;
  host: string | null;
  channel: string | null;
  lastPostedAt: string | null;
  lastError: string | null;
}

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => null);
  return res.ok ? { ok: true, data: body.data as T } : { ok: false, message: body?.error?.message ?? "Something went wrong." };
}

export function TeamsPanel({ initial }: { initial: TeamsStatusJson }) {
  const [status, setStatus] = useState(initial);
  const [form, setForm] = useState({ webhookUrl: "", channel: "" });
  const [busy, setBusy] = useState<"connect" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy("connect");
    setError(null);
    const out = await call<TeamsStatusJson>("/api/configs/integrations/teams", { method: "POST", body: JSON.stringify(form) });
    setBusy(null);
    if (!out.ok) return setError(out.message);
    setStatus(out.data);
    setForm({ webhookUrl: "", channel: "" });
  }

  async function disconnect() {
    setBusy("disconnect");
    setError(null);
    const out = await call<TeamsStatusJson>("/api/configs/integrations/teams", { method: "DELETE" });
    setBusy(null);
    if (!out.ok) return setError(out.message);
    setStatus(out.data);
  }

  return (
    <Panel title="Microsoft Teams" labelledBy="teams-panel" action={status.connected ? <Chip tone={status.lastError ? "warn" : "ok"}>{status.lastError ? "Last post failed" : "Connected"}</Chip> : <Chip tone="muted">Not connected</Chip>}>
      <p className="text-[13px] text-[var(--ds-ink3)]">
        Posts the Head&apos;s approved weekly summary to a Teams channel: the status spread, the summary and a link back to QUBIT. No PM names or project lines.
      </p>
      {error && <Banner tone="bad">{error}</Banner>}
      {!status.connected ? (
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          <div className="md:col-span-2">
            <Field label="Channel webhook URL" htmlFor="teams-url" hint="In Teams: the channel's Workflows → “Post to a channel when a webhook request is received”. Stored encrypted; never shown again.">
              <input id="teams-url" type="password" className={INPUT} value={form.webhookUrl} onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })} autoComplete="off" />
            </Field>
          </div>
          <Field label="Channel name" htmlFor="teams-channel" hint="For your reference, e.g. PMO › Weekly">
            <input id="teams-channel" className={INPUT} value={form.channel} maxLength={80} onChange={(e) => setForm({ ...form, channel: e.target.value })} autoComplete="off" />
          </Field>
          <div className="md:col-span-3">
            <button type="submit" className={PRIMARY} disabled={busy !== null || !form.webhookUrl.trim()}>
              {busy === "connect" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plug className="size-3.5" aria-hidden />} Send Test and Connect
            </button>
          </div>
        </form>
      ) : (
        <>
          <Kv
            rows={[
              ["Channel", status.channel ?? "—"],
              ["Webhook", `${status.host ?? "—"}/… (hidden)`],
              ["Last post", status.lastPostedAt ? new Date(status.lastPostedAt).toLocaleString() : "—"],
              ...(status.lastError ? ([["Last error", status.lastError]] as [string, string][]) : []),
            ]}
          />
          <div>
            <button type="button" className={QUIET} onClick={() => void disconnect()} disabled={busy !== null}>
              {busy === "disconnect" && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Disconnect
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}
