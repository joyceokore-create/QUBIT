"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Compass, Sparkles, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTour } from "@/components/tour/tour-provider";
import { FOCUS, PRIMARY, QUIET, ragFill } from "@/lib/surface";

/**
 * The header's setup nudge — the one thing on screen that bounces: a brand chip that
 * drops in once a visit while any project you run is still being set up, counting what's
 * left. Click → your projects with their progress and a Go per project, plus the walk.
 * Gone the moment everything is ready; "Not now" hides it for the day.
 */

const SNOOZE_KEY = "qubit.setup-nudge.snoozed-until";

export function SetupNudge() {
  const tour = useTour();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [snoozed, setSnoozed] = useState(true); // assume snoozed until the client checks

  const pending = tour.projects.filter((p) => p.done < p.total);

  useEffect(() => {
    try {
      const until = Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0);
      setSnoozed(until > Date.now());
    } catch {
      setSnoozed(false);
    }
  }, []);

  if (!tour.eligible || pending.length === 0 || snoozed || tour.state.active) return null;

  const snooze = () => {
    try {
      window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + 12 * 60 * 60 * 1000));
    } catch {
      /* ignore */
    }
    setSnoozed(true);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 text-[12.5px] font-bold text-[var(--brand)] shadow-[0_6px_18px_-6px_rgba(0,0,0,.45)] transition-transform hover:scale-[1.03] motion-safe:[animation:nudgeIn_.9s_cubic-bezier(.34,1.56,.64,1)_.4s_both] ${FOCUS}`}
        aria-label={`Set up ${pending.length} ${pending.length === 1 ? "project" : "projects"}`}
      >
        <Sparkles className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Set up ·</span> {pending.length}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {pending.length} of {tour.projects.length} {tour.projects.length === 1 ? "project needs" : "projects need"} setting up
            </DialogTitle>
            <DialogDescription>Gates, documents, team, YouTrack and this week&apos;s update — each project&apos;s This week tab walks you through its own.</DialogDescription>
          </DialogHeader>
          <Link href="/reports?upload=1" onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-[12px] p-3 text-[12.5px] text-[var(--qink)] transition-colors hover:bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] ${FOCUS}`} style={{ background: "color-mix(in oklab, var(--brand) 8%, transparent)" }}>
            <Upload className="size-4 flex-none text-[var(--brand)]" aria-hidden />
            <span>
              <b>All at once:</b> upload your latest status report — every project&apos;s update, status and RAG filled for you to check and send.
            </span>
          </Link>
          <ol className="flex flex-col">
            {tour.projects.map((p) => {
              const done = p.done >= p.total;
              return (
                <li key={p.id} className="flex items-center gap-3 border-t border-[var(--hair2)] py-2.5 first:border-0">
                  <span className="w-[64px] flex-none font-mono text-[10.5px] font-semibold text-[var(--ink4)]">{p.code}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--qink)]">{p.name}</span>
                  <span className="h-1.5 w-[72px] flex-none overflow-hidden rounded-full bg-[var(--wash2)]" role="img" aria-label={`${p.done} of ${p.total} done`}>
                    <span className="block h-full rounded-full" style={{ width: `${(p.done / p.total) * 100}%`, ...ragFill("Green") }} />
                  </span>
                  <span className="w-[42px] flex-none text-right text-[11.5px] tabular-nums text-[var(--ink4)]">
                    {p.done}/{p.total}
                  </span>
                  {done ? (
                    <span className="w-[60px] flex-none text-right text-[11.5px] font-semibold text-[var(--ok)]">Ready</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        tour.startSetup(p.id);
                      }}
                      className={`${QUIET} w-[60px] flex-none whitespace-nowrap px-0 text-right`}
                    >
                      Set up →
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                tour.start();
                router.refresh();
              }}
              className={`${PRIMARY} gap-1.5`}
            >
              <Compass className="size-3.5" aria-hidden /> Walk me through it
            </button>
            <button type="button" onClick={snooze} className={QUIET}>
              Not now
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
