"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { stepIndex, TOUR_STEPS, type TourState, type TourStep } from "@/lib/tour";
import { CARD_GLASS, CARD_BG, FOCUS, PRIMARY, QUIET } from "@/lib/surface";

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

const PLACES: { key: TourStep["place"]; label: string }[] = [
  { key: "projects", label: "Projects" },
  { key: "workspace", label: "Workspace" },
  { key: "reports", label: "Reports" },
];

export function TourOverlay({
  step,
  state,
  onRoute,
  onNext,
  onBack,
  onSkip,
  onExit,
}: {
  step: TourStep;
  state: TourState;
  onRoute: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onExit: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
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

  // Keyboard: Esc exits, arrows move, focus goes to the card.
  useEffect(() => {
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
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

  // Card placement: below the target if room, else above, else to the right; phone docks.
  let cardStyle: React.CSSProperties;
  if (phone) cardStyle = { left: 12, right: 12, bottom: 12, width: "auto" };
  else if (centred) cardStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: CARD_W };
  else {
    const r = rect!;
    const below = r.top + r.height + PAD + GAP;
    const spaceBelow = vh - below;
    const left = Math.min(Math.max(12, r.left), Math.max(12, vw - CARD_W - 12));
    if (spaceBelow > 240) cardStyle = { left, top: below, width: CARD_W };
    else if (r.top - PAD - GAP > 240) cardStyle = { left, bottom: vh - (r.top - PAD - GAP), width: CARD_W };
    else cardStyle = { left: Math.min(r.left + r.width + PAD + GAP, vw - CARD_W - 12), top: Math.max(12, r.top), width: CARD_W };
  }

  const cut = rect && !centred ? { x: rect.left - PAD, y: rect.top - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 } : null;

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      {/* Scrim with the cut-out — pointer events pass through the hole so the real control works. */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden style={{ pointerEvents: "none" }}>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {cut && <rect x={cut.x} y={cut.y} width={cut.w} height={cut.h} rx="12" fill="black" />}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="color-mix(in oklab, var(--qink) 58%, transparent)" mask="url(#tour-mask)" style={{ pointerEvents: "auto" }} onClick={() => undefined} />
      </svg>
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
              <span className="text-[11.5px] text-[var(--ink4)]">{step.waitingLabel}</span>
              <button type="button" onClick={onSkip} className={`${QUIET} ${FOCUS}`}>
                Skip this step
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
