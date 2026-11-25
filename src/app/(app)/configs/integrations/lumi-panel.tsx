"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Plug, Power, RefreshCw } from "lucide-react";
import { Banner, Panel, PanelList, PanelRow } from "@/components/ui/panel";
import { Field, Kv } from "@/components/ui/drawer";
import { Chip } from "@/components/ui/status-pill";
import { INPUT, PRIMARY, QUIET, SECONDARY } from "@/lib/surface";

/**
 * Configs › Integrations › Lumi (plans Phase 3 and 5). Connect the tenant's Lumi credential
 * (QUBIT tests it with Lumi before saving; the secret is never shown again), then switch
 * Lumi's autopilot on for QUBIT's in-product assistant and read Lumi's check report.
 */

export interface LumiStatusJson {
  connected: boolean;
  source: "tenant" | "env" | null;
  baseUrl: string | null;
  clientId: string | null;
  secretLast4: string | null;
  product: string | null;
  environment: string | null;
  uses: string[];
  lastError: string | null;
  assistantSetting: "lumi" | "local";
  apiBaseUrl: string;
  configUrl: string;
}

interface Autopilot {
  enabled: boolean;
  config?: { status: string; checks?: { artifact: string; status: string; path?: string; message: string }[] };
}

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => null);
  return res.ok ? { ok: true, data: body.data as T } : { ok: false, message: body?.error?.message ?? "Something went wrong." };
}

export function LumiPanel({ initial }: { initial: LumiStatusJson }) {
  const [status, setStatus] = useState(initial);
  const [form, setForm] = useState({ baseUrl: initial.baseUrl ?? "", clientId: "", clientSecret: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autopilot, setAutopilot] = useState<Autopilot | null>(null);

  async function connect() {
    setBusy("connect");
    setError(null);
    const out = await call<LumiStatusJson>("/api/configs/integrations/lumi", { method: "POST", body: JSON.stringify(form) });
    setBusy(null);
    if (!out.ok) return setError(out.message);
    setStatus(out.data);
    setForm((f) => ({ ...f, clientSecret: "" }));
  }

  async function disconnect() {
    setBusy("disconnect");
    setError(null);
    const out = await call<LumiStatusJson>("/api/configs/integrations/lumi", { method: "DELETE" });
    setBusy(null);
    if (!out.ok) return setError(out.message);
    setStatus(out.data);
    setAutopilot(null);
  }

  async function pilot(action: "status" | "on" | "refresh" | "off") {
    setBusy(action);
    setError(null);
    const out = action === "status" ? await call<Autopilot>("/api/configs/integrations/lumi/autopilot") : await call<Autopilot>("/api/configs/integrations/lumi/autopilot", { method: "POST", body: JSON.stringify({ action }) });
    setBusy(null);
    if (!out.ok) return setError(out.message);
    setAutopilot(out.data);
  }

  const spin = (key: string) => (busy === key ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null);

  return (
    <Panel title="Lumi" labelledBy="lumi-panel" action={status.connected ? <Chip tone="ok">Connected</Chip> : <Chip tone="muted">Not connected</Chip>}>
      <p className="text-[13px] text-[var(--ds-ink3)]">
        Riverbank&apos;s AI platform. QUBIT uses it to read status reports and, with autopilot on, as the in-product assistant behind Ask Q, acting as the signed-in person with their own permissions.
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
          <Field label="API address" htmlFor="lumi-base" hint="Includes /v1, for example https://lumi.example/v1">
            <input id="lumi-base" className={INPUT} value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Client ID" htmlFor="lumi-client">
            <input id="lumi-client" className={INPUT} value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} placeholder="cred_…" autoComplete="off" />
          </Field>
          <Field label="Client secret" htmlFor="lumi-secret" hint="Stored encrypted; never shown again.">
            <input id="lumi-secret" type="password" className={INPUT} value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} autoComplete="new-password" />
          </Field>
          <div className="md:col-span-3">
            <button type="submit" className={PRIMARY} disabled={busy !== null}>
              {spin("connect") ?? <Plug className="size-3.5" aria-hidden />} Test and Connect
            </button>
          </div>
        </form>
      ) : (
        <>
          <Kv
            rows={[
              ["Product", `${status.product ?? "—"} · ${status.environment ?? "—"}`],
              ["Approved for", status.uses.length ? status.uses.join(", ") : "—"],
              ["API address", status.baseUrl ?? "—"],
              ["Credential", `${status.clientId ?? "—"}${status.secretLast4 ? ` · secret ••••${status.secretLast4}` : ""}${status.source === "env" ? " (from the server's settings)" : ""}`],
              ["Ask Q engine", status.assistantSetting === "lumi" ? "Lumi" : "Local (set ASSISTANT_PROVIDER=lumi on the server to use Lumi)"],
              ["QUBIT for Lumi", status.apiBaseUrl],
              ["Configuration", status.configUrl],
            ]}
          />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-semibold text-[var(--ds-ink2)]">Autopilot</span>
            <button type="button" className={SECONDARY} onClick={() => void pilot("status")} disabled={busy !== null}>
              {spin("status")} Check
            </button>
            <button type="button" className={PRIMARY} onClick={() => void pilot("on")} disabled={busy !== null}>
              {spin("on") ?? <Power className="size-3.5" aria-hidden />} Switch On
            </button>
            <button type="button" className={SECONDARY} onClick={() => void pilot("refresh")} disabled={busy !== null}>
              {spin("refresh") ?? <RefreshCw className="size-3.5" aria-hidden />} Re-read Configuration
            </button>
            <button type="button" className={SECONDARY} onClick={() => void pilot("off")} disabled={busy !== null}>
              {spin("off")} Switch Off
            </button>
            {status.source === "tenant" && (
              <button type="button" className={`${QUIET} ml-auto`} onClick={() => void disconnect()} disabled={busy !== null}>
                Disconnect
              </button>
            )}
          </div>

          {autopilot && (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-[13px] text-[var(--ds-ink)]">
                {autopilot.enabled ? <CheckCircle2 className="size-4 text-[var(--ds-ok-text)]" aria-hidden /> : <Power className="size-4 text-[var(--ds-ink3)]" aria-hidden />}
                Autopilot is {autopilot.enabled ? "on" : "off"}
                {autopilot.config?.status && <Chip tone={autopilot.config.status === "passed" ? "ok" : autopilot.config.status === "failed" ? "bad" : "warn"}>configuration {autopilot.config.status}</Chip>}
              </p>
              {autopilot.config?.checks?.length ? (
                <PanelList label="Lumi's checks">
                  {autopilot.config.checks.map((c, i) => (
                    <PanelRow key={i} title={`${c.artifact}${c.path ? ` · ${c.path}` : ""}`} sub={c.message} chip={<Chip tone={c.status === "passed" ? "ok" : c.status === "failed" ? "bad" : "warn"}>{c.status}</Chip>} />
                  ))}
                </PanelList>
              ) : null}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
