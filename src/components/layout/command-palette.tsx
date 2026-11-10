"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, CornerDownLeft, FileText, FolderKanban, Search, User } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { MenuGroup } from "@/lib/role-menus";
import { cn } from "@/lib/utils";

/**
 * ⌘K / Ctrl+K search (UX plan UX3). Pages come from the person's own menu (filtered in the
 * browser); projects, portfolios and people come from GET /api/search, which follows real
 * permissions under RLS — "Viewing as" never narrows it (D2a). Arrow keys move, Enter opens.
 */
interface Hit {
  kind: "page" | "project" | "portfolio" | "person";
  id: string;
  label: string;
  sub: string | null;
  href: string;
}

const KIND_LABEL: Record<Hit["kind"], string> = { page: "Pages", project: "Projects", portfolio: "Portfolios", person: "People" };
const KIND_ICON = { page: FileText, project: FolderKanban, portfolio: Briefcase, person: User } as const;

export function CommandPalette({ menu }: { menu: MenuGroup[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // ⌘K / Ctrl+K toggles from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQ("");
      setRemote([]);
      setCursor(0);
    }
  }, [open]);

  // Debounced server search for 2+ characters.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRemote([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const body = res.ok ? await res.json() : { data: [] };
        setRemote(body.data ?? []);
      } catch {
        // aborted or offline — keep the page matches
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [q]);

  const pages = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    const all = menu.flatMap((g) => g.items.map((i) => ({ kind: "page" as const, id: i.key, label: i.label, sub: g.label, href: i.href })));
    return term ? all.filter((p) => p.label.toLowerCase().includes(term)) : all;
  }, [menu, q]);

  const hits = useMemo(() => [...pages, ...remote], [pages, remote]);
  useEffect(() => setCursor(0), [q]);

  const go = useCallback(
    (hit: Hit | undefined) => {
      if (!hit) return;
      setOpen(false);
      router.push(hit.href);
    },
    [router],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(hits[cursor]);
    }
  }

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  let index = -1;
  const groups = (["page", "project", "portfolio", "person"] as const)
    .map((kind) => ({ kind, items: hits.filter((h) => h.kind === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-[var(--control-h)] w-[min(280px,28vw)] items-center gap-2 rounded-[var(--control-r)] border border-white/20 bg-white/[.08] px-3 text-left text-[13px] text-white/75 outline-none transition-colors hover:bg-white/[.14] focus-visible:ring-2 focus-visible:ring-white/70 md:flex"
      >
        <Search className="size-4 flex-none" aria-hidden />
        <span className="flex-1 truncate">Search pages, projects, people</span>
        <kbd className="rounded border border-white/25 px-1.5 font-sans text-[11px] text-white/70">⌘K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="grid size-[34px] place-items-center rounded-full text-white/85 hover:bg-white/10 md:hidden"
      >
        <Search className="size-[18px]" aria-hidden />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="top-[18vh] translate-y-0 gap-0 p-0 sm:max-w-[560px]">
          <DialogTitle className="sr-only">Search QUBIT</DialogTitle>
          <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4">
            <Search className="size-4 flex-none text-[var(--ink3)]" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search pages, projects, portfolios or people"
              aria-label="Search QUBIT"
              aria-controls="cmdk-results"
              aria-activedescendant={hits[cursor] ? `cmdk-${hits[cursor].kind}-${hits[cursor].id}` : undefined}
              className="h-12 flex-1 bg-transparent text-[14px] text-[var(--qink)] outline-none placeholder:text-[var(--ink4)]"
            />
            <kbd className="rounded border border-[var(--border)] px-1.5 text-[11px] text-[var(--ink3)]">Esc</kbd>
          </div>
          <ul id="cmdk-results" ref={listRef} role="listbox" aria-label="Results" className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
            {groups.map((g) => (
              <li key={g.kind} role="presentation">
                <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--ink3)]">{KIND_LABEL[g.kind]}</div>
                <ul role="presentation">
                  {g.items.map((h) => {
                    index++;
                    const i = index;
                    const Icon = KIND_ICON[h.kind];
                    return (
                      <li
                        key={`${h.kind}-${h.id}`}
                        id={`cmdk-${h.kind}-${h.id}`}
                        role="option"
                        aria-selected={i === cursor}
                        data-index={i}
                        onMouseEnter={() => setCursor(i)}
                        onClick={() => go(h)}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-[8px] px-2.5 py-2 text-[13px]",
                          i === cursor ? "bg-[var(--surface-2)] text-[var(--qink)]" : "text-[var(--ink2)]",
                        )}
                      >
                        <Icon className="size-4 flex-none text-[var(--ink3)]" aria-hidden />
                        <span className="min-w-0 flex-1 truncate font-medium">{h.label}</span>
                        {h.sub && <span className="truncate text-[12px] text-[var(--ink3)]">{h.sub}</span>}
                        {i === cursor && <CornerDownLeft className="size-3.5 flex-none text-[var(--ink3)]" aria-hidden />}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {groups.length === 0 && (
              <li className="px-3 py-6 text-center text-[13px] text-[var(--ink3)]">
                {loading ? "Searching…" : q.trim().length < 2 ? "Type at least 2 characters." : `Nothing matches “${q.trim()}”.`}
              </li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
