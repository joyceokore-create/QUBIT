"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { INITIAL_TOUR, stepById, stepRoute, tourReducer, type TourEvent, type TourState } from "@/lib/tour";
import type { TourProjectSetup } from "@/server/tour";
import { TOUR_EVENT } from "@/components/tour/tour-events";
import { TourOverlay } from "@/components/tour/tour-overlay";

/**
 * First-week walkthrough — the provider mounts once in the app shell. It auto-starts the
 * walk the first time an eligible person (runs projects, or is a PM) lands in QUBIT, keeps
 * the in-progress state in localStorage so the walk survives the page navigations it
 * makes, listens for the real actions the hands-on steps wait for, and stamps the server
 * flag when the person finishes or exits. "Show me around" replays through `start()`.
 */

const STORAGE_KEY = "qubit.tour.v1";

interface TourApi {
  state: TourState;
  eligible: boolean;
  /** The projects the viewer runs, with setup progress (welcome takeover + header nudge). */
  projects: TourProjectSetup[];
  start: () => void;
}

const TourContext = createContext<TourApi | null>(null);

function readSaved(): TourState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TourState) : null;
  } catch {
    return null;
  }
}

export function TourProvider({
  offer,
  eligible,
  firstProjectId,
  reportsQuery = "",
  projects = [],
  children,
}: {
  offer: boolean;
  eligible: boolean;
  firstProjectId: string | null;
  reportsQuery?: string;
  projects?: TourProjectSetup[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, dispatch] = useReducer(tourReducer, INITIAL_TOUR);
  const [hydrated, setHydrated] = useState(false);
  const stampedRef = useRef(false);

  // Resume an in-progress walk, or offer it once.
  useEffect(() => {
    const saved = readSaved();
    if (saved?.active) {
      dispatch({ type: "start", projectId: saved.projectId, reportsQuery: saved.reportsQuery ?? reportsQuery });
      // Jump straight to the saved step by replaying "next" is lossy; set the step directly.
      queueMicrotask(() => dispatch({ type: "event", event: "__resume__" as TourEvent }));
    } else if (offer) {
      dispatch({ type: "start", projectId: firstProjectId, reportsQuery });
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The resume trick above can't restore a mid-walk step through the reducer; patch it in.
  const [resumed, setResumed] = useState<TourState | null>(() => (typeof window !== "undefined" ? readSaved() : null));
  const effective: TourState = useMemo(() => (resumed?.active && state.active && state.step === "welcome" ? resumed : state), [resumed, state]);
  useEffect(() => {
    if (state.step !== "welcome") setResumed(null);
  }, [state.step]);

  // Persist while active; clear when done.
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (effective.active) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(effective));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable — the walk still runs for this page */
    }
  }, [effective, hydrated]);

  // Stamp the server flag on finish/exit — once per walk.
  const stamp = useCallback(() => {
    if (stampedRef.current) return;
    stampedRef.current = true;
    void fetch("/api/me/tour", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "complete" }) }).catch(() => {});
  }, []);

  // Real actions tick the waiting step.
  useEffect(() => {
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ event: TourEvent }>).detail;
      if (detail?.event) dispatch({ type: "event", event: detail.event });
    };
    window.addEventListener(TOUR_EVENT, onEvent);
    return () => window.removeEventListener(TOUR_EVENT, onEvent);
  }, []);

  // Navigate to the step's route when it differs from where we are.
  const step = stepById(effective.step);
  const route = stepRoute(step, effective.projectId, effective.reportsQuery);
  const wanted = route ? `${route.pathname}${route.search}` : null;
  // Same page = same pathname and every query key the step names matches (decoded —
  // useSearchParams serialises a space as "+", the step href as "%20").
  const onRoute =
    !route ||
    (pathname === route.pathname && [...new URLSearchParams(route.search).entries()].every(([k, v]) => search.get(k) === v));
  useEffect(() => {
    if (!effective.active || !wanted || onRoute) return;
    router.push(wanted);
  }, [effective.active, wanted, onRoute, router]);

  const api = useMemo<TourApi>(
    () => ({
      state: effective,
      eligible,
      projects,
      start: () => {
        stampedRef.current = false;
        setResumed(null);
        dispatch({ type: "start", projectId: firstProjectId, reportsQuery });
      },
    }),
    [effective, eligible, firstProjectId, reportsQuery, projects],
  );

  const act = useCallback(
    (type: "next" | "back" | "skip" | "exit") => {
      if (type === "exit" || (type === "next" && effective.step === "done")) stamp();
      if (effective.step === "done" && type === "next") {
        dispatch({ type: "exit" });
        return;
      }
      dispatch({ type });
    },
    [effective.step, stamp],
  );

  return (
    <TourContext.Provider value={api}>
      {children}
      {hydrated && effective.active && (
        <TourOverlay step={step} state={effective} projects={projects} onRoute={onRoute} onNext={() => act("next")} onBack={() => act("back")} onSkip={() => act("skip")} onExit={() => act("exit")} />
      )}
    </TourContext.Provider>
  );
}

export function useTour(): TourApi {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}
