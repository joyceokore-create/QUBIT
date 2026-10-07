"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, Compass, Send, X } from "lucide-react";
import { stepIndex, TOUR_STEPS, type TourState, type TourStep } from "@/lib/tour";
import type { TourProjectSetup } from "@/server/tour";
import { CARD_GLASS, CARD_BG, FOCUS, PRIMARY, QUIET, ragFill } from "@/lib/surface";

/** Layers a hands-on step opens; while one is in the DOM the walk steps aside. */
const OPEN_LAYERS = '[data-slot="dialog-content"], [data-slot="select-content"], [data-slot="dropdown-menu-content"], [role="listbox"], [role="menu"]';
const CONTROL = 'button, [role="combobox"], a[href], input, select, textarea';

/**
 * The spotlight: the page dims, a rounded cut-out frames the real control (brand ring,
 * pulseGlow), and one card speaks a sentence and an action. The card sits beside the
 * target where it fits and docks to the bottom on a phone. Esc exits, ←/→ step, focus
 * stays in the card. Reduced motion: no pulse, no entrance.
 */

const PAD = 8;
const GAP = 14;
const CARD_W = 360;

type Rect = { top: number; left: number; width: number; height: number };

/** Four rectangles covering everything except the cut-out. */
function panelsAround(cut: { x: number; y: number; w: number; h: number }, vw: number, vh: number): React.CSSProperties[] {
  const right = Math.max(0, vw - (cut.x + cut.w));
  const bottom = Math.max(0, vh - (cut.y + cut.h));
  return [
    { left: 0, top: 0, width: "100%", height: Math.max(0, cut.y) },
    { left: 0, top: cut.y, width: Math.max(0, cut.x), height: cut.h },
    { left: cut.x + cut.w, top: cut.y, width: right, height: cut.h },
    { left: 0, top: cut.y + cut.h, width: "100%", height: bottom },
  ];
}

const PLACES: { key: TourStep["place"]; label: string }[] = [
  { key: "projects", label: "Projects" },
  { key: "workspace", label: "Workspace" },
  { key: "reports", label: "Reports" },
];

export function TourOverlay({
  step,
  state,
  projects,
  onRoute,
  onNext,
  onBack,
  onSkip,
  onExit,
}: {
  step: TourStep;
  state: TourState;
  projects: TourProjectSetup[];
  onRoute: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onExit: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
  // A hands-on step opens something real — the template picker, the Add-document or
  // Add-member dialog. Those live below this layer, so while one is open the walk steps
  // aside entirely and comes back when it closes (or moves on when the event fires).
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);

  // Find and follow the target once we are on the right page.
  useLayoutEffect(() => {
    setRect(null);
    setMissing(false);
    if (!step.target || !onRoute) return;
    let el: Element | null = null;
    let raf = 0;
    const deadline = Date.now() + 4000;
    const measure = () => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const find = () => {
      el = document.querySelector(step.target!);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        measure();
        return;
      }
      if (Date.now() < deadline) raf = window.setTimeout(find, 120);
      else setMissing(true);
    };
    find();
    const onMove = () => measure();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    const ro = new ResizeObserver(onMove);
    const tick = window.setInterval(measure, 400);
    const vp = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    vp();
    window.addEventListener("resize", vp);
    return () => {
      window.clearTimeout(raf);
      window.clearInterval(tick);
      ro.disconnect();
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("resize", vp);
    };
  }, [step.target, step.id, onRoute]);

  useEffect(() => {
    setVw(window.innerWidth);
    setVh(window.innerHeight);
  }, []);

  useEffect(() => {
    setBusy(false);
    if (!step.waitFor) return;
    const check = () => setBusy(Boolean(document.querySelector(OPEN_LAYERS)));
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    check();
    return () => mo.disconnect();
  }, [step.id, step.waitFor]);

  // The step's own action: open the framed control for them (the hole is clickable too).
  const doIt = () => {
    if (!step.target) return;
    const host = document.querySelector(step.target);
    if (!host) return;
    const ctl = (host.matches(CONTROL) ? host : host.querySelector(CONTROL)) as HTMLElement | null;
    if (!ctl) return;
    ctl.scrollIntoView({ block: "center" });
    ctl.focus();
    ctl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse", button: 0 }));
    ctl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    ctl.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerType: "mouse", button: 0 }));
    ctl.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
    ctl.click();
  };

  // Keyboard: Esc exits, arrows move, focus goes to the card.
  useEffect(() => {
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector(OPEN_LAYERS)) return; // a dialog or picker owns the keys
      if (e.key === "Escape") onExit();
      else if (e.key === "ArrowRight" && !step.waitFor) onNext();
      else if (e.key === "ArrowLeft") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step.id, step.waitFor, onNext, onBack, onExit]);

  const centred = !step.target || missing || !onRoute || !rect;
  const phone = vw > 0 && vw < 640;
  const n = stepIndex(step.id);
  const total = TOUR_STEPS.length;
  const waiting = Boolean(step.waitFor);
  const takeover = step.id === "welcome" || step.id === "done";
  const pending = projects.filter((p) => p.done < p.total);

  if (busy && waiting) return null;

  // The first and last cards are a takeover, not a tooltip: the whole screen is the moment.
  if (takeover) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="presentation">
        <div aria-hidden className="absolute inset-0" style={{ background: "color-mix(in oklab, var(--qink) 78%, transparent)", backdropFilter: "blur(6px)" }} />
        <div
          ref={cardRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          className={`${CARD_GLASS} relative flex w-full max-w-[560px] flex-col gap-5 p-[28px_28px_24px] outline-none motion-safe:[animation:rise_.55s_cubic-bezier(.22,1,.36,1)_both]`}
          style={CARD_BG}
        >
          <button type="button" onClick={onExit} aria-label="Exit tour" className={`${QUIET} absolute right-3 top-3 px-1.5`}>
            <X className="size-4" aria-hidden />
          </button>
          <div>
            <h2 id="tour-title" className="font-heading text-[28px] font-bold leading-[1.1] tracking-[-.6px] text-[var(--qink)] [text-wrap:balance]">
              {step.id === "welcome" ? "Your week in QUBIT" : "You're set"}
            </h2>
            <p className="mt-2 max-w-[46ch] text-[14.5px] leading-[1.55] text-[var(--ink3)] [text-wrap:pretty]">
              {step.id === "welcome"
                ? projects.length > 0
                  ? `You run ${projects.length} ${projects.length === 1 ? "project" : "projects"} here — ${projects.map((p) => p.code).slice(0, 6).join(", ")}${projects.length > 6 ? "…" : ""}. ${pending.length === 0 ? (projects.length === 1 ? "It is set up." : "They are all set up.") : projects.length === 1 ? "It still needs setting up." : `${pending.length} of them still ${pending.length === 1 ? "needs" : "need"} setting up.`}`
                  : "No project is yours yet — once one is, this is how the week runs."
                : "The workspace's This week card and Reports › This week are the two places the week happens. Replay this walk any time from your menu."}
            </p>
          </div>
          {step.id === "welcome" && (
            <ol className="flex flex-col gap-3">
              {[
                { Icon: ClipboardCheck, head: "Set each project up once", line: "Delivery gates, documents, team, YouTrack — a short checklist on every project's This week tab." },
                { Icon: Compass, head: "Keep the board honest", line: "Tasks mirror from YouTrack; progress and RAG are derived, never typed." },
                { Icon: Send, head: "Send Friday's update from one place", line: "One line, one RAG, Confirm & send — or upload your status report and send them all." },
              ].map(({ Icon, head, line }) => (
                <li key={head} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 flex-none items-center justify-center rounded-full" style={{ background: "color-mix(in oklab, var(--brand) 12%, transparent)", color: "var(--brand)" }} aria-hidden>
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-[14px] font-semibold text-[var(--qink)]">{head}</span>
                    <span className="block text-[13px] text-[var(--ink3)]">{line}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {step.id === "done" && pending.length > 0 && (
            <ul className="flex flex-col" aria-label="Projects still to set up">
              {pending.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center gap-3 border-t border-[var(--hair2)] py-2 first:border-0 text-[13px]">
                  <span className="w-[64px] flex-none font-mono text-[10.5px] font-semibold text-[var(--ink4)]">{p.code}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--qink)]">{p.name}</span>
                  <span className="h-1.5 w-[72px] flex-none overflow-hidden rounded-full bg-[var(--wash2)]" role="img" aria-label={`${p.done} of ${p.total} done`}>
                    <span className="block h-full rounded-full" style={{ width: `${(p.done / p.total) * 100}%`, ...ragFill("Green") }} />
                  </span>
                  <span className="w-[36px] flex-none text-right text-[11.5px] tabular-nums text-[var(--ink4)]">
                    {p.done}/{p.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={onNext} className={`${PRIMARY} h-11 px-5 text-[14px]`}>
              {step.id === "welcome" ? "Show me — 6 steps" : "Done"}
              {step.id === "welcome" ? <ArrowRight className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
            </button>
            {step.id === "welcome" && (
              <button type="button" onClick={onExit} className={QUIET}>
                I&apos;ll explore on my own
              </button>
            )}
            <span className="ml-auto text-[11.5px] text-[var(--ink5)]">Esc to close</span>
          </div>
        </div>
      </div>
    );
  }

  // Card placement — never over the framed control: below it when there is room, else
  // above, else beside it (only when that truly clears the hole), else below anyway,
  // clamped to the viewport. A phone docks the card to the bottom.
  const CARD_H = 200;
  // A framed control taller than most of the viewport (the whole status card on a short
  // window) leaves no side to sit on — dock the card like a phone does.
  const huge = Boolean(rect && !centred && rect.height > vh * 0.6);
  let cardStyle: React.CSSProperties;
  if (phone) cardStyle = { left: 12, right: 12, bottom: 12, width: "auto" };
  else if (huge) cardStyle = { right: 12, bottom: 12, width: CARD_W, maxHeight: vh - 24, overflowY: "auto" };
  else if (centred) cardStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: CARD_W };
  else {
    const r = rect!;
    const holeBottom = r.top + r.height + PAD;
    const holeTop = r.top - PAD;
    const holeRight = r.left + r.width + PAD;
    const left = Math.min(Math.max(12, r.left), Math.max(12, vw - CARD_W - 12));
    if (vh - holeBottom - GAP >= CARD_H) cardStyle = { left, top: holeBottom + GAP, width: CARD_W };
    else if (holeTop - GAP >= CARD_H) cardStyle = { left, bottom: vh - (holeTop - GAP), width: CARD_W };
    else if (holeRight + GAP + CARD_W <= vw - 12) cardStyle = { left: holeRight + GAP, top: Math.min(Math.max(12, r.top), vh - CARD_H - 12), width: CARD_W };
    else if (vh - holeBottom - GAP >= 120) cardStyle = { left, top: holeBottom + GAP, width: CARD_W, maxHeight: vh - holeBottom - GAP - 12, overflowY: "auto" };
    else cardStyle = { left, bottom: vh - (holeTop - GAP), width: CARD_W, maxHeight: Math.max(120, holeTop - GAP - 12), overflowY: "auto" };
  }

  const cut = rect && !centred ? { x: rect.left - PAD, y: rect.top - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 } : null;

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      {/* Scrim as four panels around the cut-out: the hole is real, so the framed control
          takes clicks and the hands-on steps work; everything else is covered. */}
      {(cut ? panelsAround(cut, vw, vh) : [{ left: 0, top: 0, width: "100%", height: "100%" }]).map((p, i) => (
        <div key={i} aria-hidden className="absolute" style={{ ...p, background: "color-mix(in oklab, var(--qink) 58%, transparent)", pointerEvents: "auto" }} />
      ))}
      {cut && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[12px] ring-2 ring-[var(--brand)] motion-safe:[animation:pulseGlow_2.2s_ease-in-out_infinite]"
          style={{ left: cut.x, top: cut.y, width: cut.w, height: cut.h, ["--glowA" as string]: "40%" }}
        />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className={`${CARD_GLASS} absolute flex flex-col gap-3 p-[16px_18px] outline-none motion-safe:[animation:rise_.45s_cubic-bezier(.22,1,.36,1)_both]`}
        style={{ ...cardStyle, ...CARD_BG }}
      >
        <div className="flex items-center gap-3">
          <ol className="flex items-center gap-2" aria-label="Where you are">
            {PLACES.map((p) => {
              const on = step.place === p.key;
              return (
                <li key={p.label} className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: on ? "var(--brand)" : "var(--ink5)" }}>
                  <span className="block size-[7px] rounded-full" style={{ background: on ? "var(--brand)" : "var(--input)" }} aria-hidden />
                  {p.label}
                </li>
              );
            })}
          </ol>
          <span className="ml-auto text-[11px] tabular-nums text-[var(--ink5)]">
            {n + 1}/{total}
          </span>
          <button type="button" onClick={onExit} aria-label="Exit tour" className={`${QUIET} -mr-1.5 px-1`}>
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
        <div>
          <h2 id="tour-title" className="text-[15px] font-bold tracking-[-.2px] text-[var(--qink)] [text-wrap:balance]">
            {step.title}
          </h2>
          <p className="mt-1 text-[13px] leading-[1.5] text-[var(--ink3)] [text-wrap:pretty]">{step.line}</p>
          {missing && <p className="mt-1.5 text-[11.5px] text-[var(--warn)]">Couldn&apos;t find that control on this page — look for it where the line says, or move on.</p>}
          {!state.projectId && step.id === "projects" && <p className="mt-1.5 text-[11.5px] text-[var(--warn)]">You don&apos;t run a project yet — once one is yours, the workspace steps unlock. We&apos;ll go straight to Reports.</p>}
        </div>
        {waiting && <p className="text-[11.5px] font-semibold text-[var(--ink4)]">{step.waitingLabel}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {step.id !== "welcome" && step.id !== "done" && (
            <button type="button" onClick={onBack} className={`${QUIET} inline-flex items-center gap-1`}>
              <ArrowLeft className="size-3.5" aria-hidden /> Back
            </button>
          )}
          {step.id === "welcome" && (
            <button type="button" onClick={onExit} className={QUIET}>
              I&apos;ll explore
            </button>
          )}
          <span className="flex-1" />
          {waiting ? (
            <>
              <button type="button" onClick={onSkip} className={`${QUIET} ${FOCUS}`}>
                Skip this step
              </button>
              <button type="button" onClick={doIt} className={`${PRIMARY} inline-flex items-center gap-1.5`} disabled={missing}>
                {step.action}
                <ArrowRight className="size-3.5" aria-hidden />
              </button>
            </>
          ) : (
            <button type="button" onClick={onNext} className={`${PRIMARY} inline-flex items-center gap-1.5`}>
              {step.id === "done" ? <Check className="size-3.5" aria-hidden /> : null}
              {step.action}
              {step.id !== "done" && <ArrowRight className="size-3.5" aria-hidden />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
