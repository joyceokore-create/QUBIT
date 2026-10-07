"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { INITIAL_TOUR, stepById, stepRoute, tourReducer, type TourEvent, type TourState, type TourStepId, type TourTrack } from "@/lib/tour";
import type { TourProjectSetup } from "@/server/tour";
import { TOUR_EVENT } from "@/components/tour/tour-events";
import { TourOverlay } from "@/components/tour/tour-overlay";

/**
 * First-week walkthrough — the provider mounts once in the app shell. It offers the welcome
 * takeover the first time an eligible person (runs projects, or is a PM) lands in QUBIT,
 * keeps an in-progress walk in localStorage so it survives the page navigations it makes,
 * listens for the real actions the set-up steps wait for, and stamps the server flag when
 * a walk finishes or is dismissed. Set-up progress itself is the projects' data: a set-up
 * walk skips whatever a project already has, so leaving and coming back loses nothing.
 */

const STORAGE_KEY = "qubit.tour.v2";

interface TourApi {
  state: TourState;
  eligible: boolean;
  /** The projects the viewer runs, with setup progress (welcome takeover + header nudge). */
  projects: TourProjectSetup[];
  /** The app walk has been seen (finished or dismissed) before. */
  appDone: boolean;
  /** The welcome takeover: choose Set up or the app walk. */
  start: () => void;
  /** The set-up walk on one project (default: the first still needing it). */
  startSetup: (projectId?: string) => void;
  /** The app walk. */
  startApp: () => void;
}

const TourContext = createContext<TourApi | null>(null);

function readSaved(): TourState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const s = raw ? (JSON.parse(raw) as Partial<TourState>) : null;
    return s && typeof s.step === "string" && Array.isArray(s.completed) ? (s as TourState) : null;
  } catch {
    return null;
  }
}

/** Set-up steps a project has already done (or that don't apply) — the walk skips them. */
export function completedSetupSteps(p: TourProjectSetup | undefined): TourStepId[] {
  if (!p) return [];
  const out: TourStepId[] = [];
  if (p.items.gates) out.push("gates");
  if (p.items.documents) out.push("documents");
  if (p.items.team) out.push("team");
  if (p.items.youtrack !== false) out.push("youtrack");
  if (p.items.thisWeek) out.push("update");
  return out;
}

export function TourProvider({
  offer,
  eligible,
  firstProjectId,
  reportsQuery = "",
  dashboardQuery = "",
  appDone = false,
  projects = [],
  children,
}: {
  offer: boolean;
  eligible: boolean;
  firstProjectId: string | null;
  reportsQuery?: string;
  dashboardQuery?: string;
  appDone?: boolean;
  projects?: TourProjectSetup[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, dispatch] = useReducer(tourReducer, INITIAL_TOUR);
  const [hydrated, setHydrated] = useState(false);
  const stampedRef = useRef(false);

  // Resume an in-progress walk, or offer the welcome once.
  useEffect(() => {
    const saved = readSaved();
    if (saved?.active) dispatch({ type: "resume", state: saved });
    else if (offer) dispatch({ type: "start", projectId: firstProjectId, reportsQuery, dashboardQuery });
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist while active; clear when done.
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (state.active) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable — the walk still runs for this page */
    }
  }, [state, hydrated]);

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
  const step = stepById(state.step);
  const route = stepRoute(step, state);
  const wanted = route ? `${route.pathname}${route.search}` : null;
  // Same page = same pathname and every query key the step names matches (decoded —
  // useSearchParams serialises a space as "+", the step href as "%20").
  const onRoute =
    !route ||
    (pathname === route.pathname && [...new URLSearchParams(route.search).entries()].every(([k, v]) => search.get(k) === v));
  useEffect(() => {
    if (!state.active || !wanted || onRoute) return;
    router.push(wanted);
  }, [state.active, wanted, onRoute, router]);

  const pending = useMemo(() => projects.filter((p) => p.done < p.total), [projects]);

  const choose = useCallback(
    (track: TourTrack, projectId: string | null) => {
      const pid = track === "setup" ? (projectId ?? pending[0]?.id ?? firstProjectId) : (projectId ?? firstProjectId);
      dispatch({ type: "choose", track, projectId: pid, completed: track === "setup" ? completedSetupSteps(projects.find((p) => p.id === pid)) : [] });
    },
    [pending, firstProjectId, projects],
  );

  const api = useMemo<TourApi>(
    () => ({
      state,
      eligible,
      projects,
      appDone,
      start: () => {
        stampedRef.current = false;
        dispatch({ type: "start", projectId: firstProjectId, reportsQuery, dashboardQuery });
      },
      startSetup: (projectId) => {
        stampedRef.current = false;
        dispatch({ type: "start", projectId: firstProjectId, reportsQuery, dashboardQuery });
        choose("setup", projectId ?? null);
      },
      startApp: () => {
        stampedRef.current = false;
        dispatch({ type: "start", projectId: firstProjectId, reportsQuery, dashboardQuery });
        choose("app", null);
      },
    }),
    [state, eligible, projects, appDone, firstProjectId, reportsQuery, dashboardQuery, choose],
  );

  const act = useCallback(
    (type: "next" | "back" | "skip" | "exit") => {
      const atEnd = state.step === "setup-done" || state.step === "app-done";
      if (type === "exit" || (type === "next" && atEnd)) stamp();
      if (atEnd && type === "next") {
        dispatch({ type: "exit" });
        return;
      }
      dispatch({ type });
    },
    [state.step, stamp],
  );

  return (
    <TourContext.Provider value={api}>
      {children}
      {hydrated && state.active && (
        <TourOverlay
          step={step}
          state={state}
          projects={projects}
          appDone={appDone}
          onRoute={onRoute}
          onChoose={choose}
          onNext={() => act("next")}
          onBack={() => act("back")}
          onSkip={() => act("skip")}
          onExit={() => act("exit")}
        />
      )}
    </TourContext.Provider>
  );
}

export function useTour(): TourApi {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}
