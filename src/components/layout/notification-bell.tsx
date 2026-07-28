"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Notif {
  id: string;
  kind: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);

  async function load() {
    try {
      const d = await fetch("/api/notifications").then((r) => r.json());
      setItems(d.items ?? []);
      setUnread(d.unread ?? 0);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void load();
    // Live via SSE (M0 — no polling): the outbox emits "notification.created" on the
    // tenant stream whenever a mutation fans out notifications. EventSource reconnects
    // itself on drops (server sends a retry hint), and each reconnect replays load().
    const es = new EventSource("/api/events");
    const onNotify = () => void load();
    es.addEventListener("notification.created", onNotify);
    es.onopen = onNotify;
    return () => {
      es.removeEventListener("notification.created", onNotify);
      es.close();
    };
  }, []);

  async function markAll() {
    await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
    void load();
  }
  async function open(n: Notif) {
    if (!n.read) await fetch(`/api/notifications/${n.id}`, { method: "PATCH" }).catch(() => {});
    void load();
  }

  return (
    <DropdownMenu onOpenChange={(o) => o && void load()}>
      <DropdownMenuTrigger
        aria-label="Notifications"
        className="relative flex size-[34px] flex-none items-center justify-center rounded-full border border-[var(--tbchipbd)] bg-[var(--tbchipbg)] text-[var(--tbink)] transition-colors hover:text-[var(--tbinkS)]"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[9px] font-bold text-[var(--onbrand)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[320px] p-0">
        <div className="flex items-center justify-between border-b border-[var(--w06)] px-3 py-2">
          <DropdownMenuLabel className="p-0 text-[11px] uppercase tracking-[1px] text-[var(--ink5)]">
            Notifications
          </DropdownMenuLabel>
          {unread > 0 && (
            <button type="button" onClick={markAll} className="text-[11px] font-semibold text-brand hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {items.length === 0 && <div className="px-3 py-6 text-center text-[12px] text-[var(--ink5)]">You’re all caught up.</div>}
          {items.map((n) => {
            const row = (
              <div className="flex gap-2.5 px-3 py-2.5 hover:bg-[var(--w03)]">
                {!n.read && <span className="mt-1.5 size-2 flex-none rounded-full bg-[var(--brand)]" />}
                <div className={`min-w-0 flex-1 ${n.read ? "pl-[18px]" : ""}`}>
                  <p className="text-[12px] leading-[1.45] text-[var(--ink2)]">{n.message}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--ink5)]">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
              </div>
            );
            return n.link ? (
              <Link key={n.id} href={n.link} onClick={() => open(n)} className="block">
                {row}
              </Link>
            ) : (
              <button key={n.id} type="button" onClick={() => open(n)} className="block w-full text-left">
                {row}
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
