"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { BRIEF_CARD_LINES, BRIEF_EMPTY, BRIEF_GROUP_LABEL, BRIEF_GROUPS, type BriefGroup, type BriefItem } from "@/lib/daily-brief";
import { PRIMARY, SECONDARY } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX4 — the Daily Brief card and its drawer (UX plan D4, D4a).
 *
 * The card's size is fixed: at most three lines, each clamped to two text lines; the full text
 * is always in the drawer, and clicking a line opens it there. "View N more" (top right, only
 * when N > 0) opens the whole Brief grouped Needs action now → Waiting on you → For your
 * information. Solid dark brand surface, full-opacity white text (≥ 4.5:1, see --brief-bg).
 */

const SOURCE = "from status updates, gate records and RAID items. Check before acting.";
const GROUP_DOT: Record<BriefGroup, string> = { now: "bg-[var(--bad-ink)]", wait: "bg-[var(--warn-ink)]", fyi: "bg-[var(--stage-exploring)]" };

export function DailyBrief({ items, generatedAt }: { items: BriefItem[]; generatedAt: string }) {
  const [open, setOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const shown = items.slice(0, BRIEF_CARD_LINES);
  const more = Math.max(items.length - BRIEF_CARD_LINES, 0);

  function openDrawer(id: string | null) {
    setFocusId(id);
    setOpen(true);
  }

  return (
    <section
      aria-label="Daily Brief"
      className="flex flex-col gap-2 rounded-[14px] px-5 py-4"
      style={{ background: "var(--brief-bg)", color: "var(--brief-ink)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[1.2px]">
          <Sparkles className="size-3" aria-hidden />
          Daily Brief
        </span>
        {more > 0 && (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => openDrawer(null)}
            className="rounded-full border border-white/40 bg-white/15 px-3 py-1 text-[12px] font-bold text-white outline-none transition-colors hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brief-bg)]"
          >
            View {more} more
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="border-t border-white/15 py-1.5 text-[13.5px] font-semibold text-white">{BRIEF_EMPTY}</p>
      ) : (
        <ul className="flex flex-col">
          {shown.map((item) => (
            <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-t border-white/15 py-1.5">
              <button
                type="button"
                onClick={() => openDrawer(item.id)}
                className="line-clamp-2 rounded-sm text-left text-[13.5px] leading-snug text-white outline-none hover:underline hover:decoration-white/50 hover:underline-offset-[3px] focus-visible:ring-2 focus-visible:ring-white"
                aria-label={`${item.emphasis} ${item.detail} Show in full`}
              >
                <b className="font-semibold">{item.emphasis}</b> {item.detail}
              </button>
              <Link
                href={item.action.href}
                className="whitespace-nowrap rounded-sm text-[12px] font-semibold text-white underline decoration-white/50 underline-offset-[3px] outline-none hover:decoration-white focus-visible:ring-2 focus-visible:ring-white"
              >
                {item.action.label} <span aria-hidden>→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11.5px] text-white">
        Generated {generatedAt} today {SOURCE}
      </p>

      <BriefDrawer open={open} onOpenChange={setOpen} items={items} generatedAt={generatedAt} focusId={focusId} />
    </section>
  );
}

function BriefDrawer({
  open,
  onOpenChange,
  items,
  generatedAt,
  focusId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: BriefItem[];
  generatedAt: string;
  focusId: string | null;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // A clicked line opens the drawer on that item.
  useEffect(() => {
    if (!open || !focusId) return;
    const t = setTimeout(() => {
      bodyRef.current?.querySelector<HTMLElement>(`[data-brief-id="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: "center" });
    }, 60);
    return () => clearTimeout(t);
  }, [open, focusId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[440px]">
        <div className="border-b border-[var(--border)] px-5 py-4 pr-12">
          <SheetTitle className="flex items-center gap-1.5 text-[16px] font-bold text-[var(--qink)]">
            <Sparkles className="size-4 text-[var(--brand)]" aria-hidden />
            Daily Brief
          </SheetTitle>
          <SheetDescription className="mt-0.5 text-[12px] text-[var(--ink3)]">
            {items.length} {items.length === 1 ? "item" : "items"} · generated {generatedAt} today
          </SheetDescription>
        </div>

        <div ref={bodyRef} className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-4 pt-2">
          {items.length === 0 && <p className="py-6 text-center text-[13px] text-[var(--ink3)]">{BRIEF_EMPTY}</p>}
          {BRIEF_GROUPS.map((group) => {
            const list = items.filter((i) => i.group === group);
            if (!list.length) return null;
            return (
              <section key={group} aria-label={BRIEF_GROUP_LABEL[group]}>
                <h3 className="flex items-center gap-1.5 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[.07em] text-[var(--ink3)]">
                  <span className={cn("size-2 rounded-full", GROUP_DOT[group])} aria-hidden />
                  {BRIEF_GROUP_LABEL[group]}
                  <span className="ml-1 rounded-full bg-[var(--surface-2)] px-1.5 tracking-normal text-[var(--ink2)]">{list.length}</span>
                </h3>
                <ul>
                  {list.map((item) => (
                    <li
                      key={item.id}
                      data-brief-id={item.id}
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-dotted border-[var(--border)] py-2.5 last:border-b-0",
                        focusId === item.id && "-mx-2 rounded-[8px] bg-[var(--surface-2)] px-2",
                      )}
                    >
                      <div className="min-w-0">
                        <b className="block text-[13px] font-semibold text-[var(--qink)]">{item.emphasis}</b>
                        <span className="text-[12px] text-[var(--ink2)]">{item.detail}</span>
                      </div>
                      <Link
                        href={item.action.href}
                        onClick={() => onOpenChange(false)}
                        className={cn(group === "now" ? PRIMARY : SECONDARY, "whitespace-nowrap")}
                      >
                        {item.action.label}
                        <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <p className="border-t border-[var(--border)] px-5 py-3 text-[11.5px] text-[var(--ink3)]">Generated {SOURCE}</p>
      </SheetContent>
    </Sheet>
  );
}
