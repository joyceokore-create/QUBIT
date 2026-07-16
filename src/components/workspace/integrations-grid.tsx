"use client";

import { useCallback, useEffect, useState } from "react";
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
}

export function IntegrationsGrid({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [connect, setConnect] = useState<Card | null>(null);
  const [statuses, setStatuses] = useState<Record<string, string>>({});

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

  const set = async (provider: string, body: { connected: boolean; resource?: string | null; token?: string }) => {
    const ok = await fetch(`/api/projects/${projectId}/integrations/${provider}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.ok);
    if (ok) void load();
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <div key={c.provider} className="flex flex-col gap-3 rounded-[16px] border border-[var(--w07)] bg-[var(--qcard)] p-[18px]">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-[var(--w06)] text-[11px] font-bold text-[var(--ink2)]">
              {c.monogram}
            </span>
            <span className="flex-1 text-[15px] font-bold text-[var(--qink)]">{c.name}</span>
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
          <div className="mt-auto flex items-center gap-3">
            {canEdit ? (
              c.connected ? (
                <button
                  type="button"
                  onClick={() => set(c.provider, { connected: false, resource: null })}
                  className="rounded-[9px] border border-[var(--w12)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--ink2)] hover:border-brand hover:text-brand"
                >
                  Disconnect
                </button>
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

      {connect && (
        <ConnectDialog
          card={connect}
          onClose={() => setConnect(null)}
          onConnect={async (resource, token) => {
            await set(connect.provider, { connected: true, resource: resource || null, token: token || undefined });
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
  onConnect: (resource: string, token: string) => void;
}) {
  const [resource, setResource] = useState("");
  const [token, setToken] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Connect {card.name}</DialogTitle>
          <DialogDescription>
            Link this project to {card.name} — Q uses it for {card.feedsQ}.
            {card.live ? "" : " (Live sync for this provider is coming; this saves the connection.)"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-ink-2">{card.resourceLabel}</label>
          <Input value={resource} onChange={(e) => setResource(e.target.value)} placeholder={card.resourceLabel} autoFocus />
          {card.live && (
            <>
              <label className="text-sm font-medium text-ink-2">Access token</label>
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Fine-grained PAT (read-only)"
              />
              <p className="text-xs text-ink-3">
                Stored encrypted at rest; used server-side only. Scope it read-only to this repo.
              </p>
            </>
          )}
          <div className="flex justify-end">
            <Button type="button" onClick={() => onConnect(resource.trim(), token.trim())}>Connect</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
