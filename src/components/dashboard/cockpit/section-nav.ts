"use client";

// Bridge between the mounted cockpit view and the app sidebar (riverbank-shell):
// the view publishes its section list (Overview / Pipeline / Portfolio / …) here
// and the sidebar renders it as a dropdown under the Dashboard item — one
// navigation pane, no second sidebar inside the page. Cleared on unmount, so
// the dropdown exists only while a cockpit view is on screen.

import { useEffect, useRef, useSyncExternalStore } from "react";

export interface CockpitSection {
  id: string;
  /** Cockpit icon name (pm-v3 ICONS key) — the sidebar maps it to its lucide set. */
  icon: string;
  label: string;
  /** When set, the sidebar renders a route link instead of an in-page scroll jump. */
  href?: string;
}

interface SectionNavState {
  sections: readonly CockpitSection[];
  active: string;
}

const EMPTY: SectionNavState = { sections: [], active: "" };
let state: SectionNavState = EMPTY;
const listeners = new Set<() => void>();

function set(next: SectionNavState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useCockpitSections(): SectionNavState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

/** Sidebar click: mark the section active and scroll it into view. */
export function jumpToSection(id: string) {
  set({ ...state, active: id });
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** A cockpit view publishes its sections while mounted. */
export function usePublishSections(sections: CockpitSection[]) {
  const ref = useRef(sections);
  ref.current = sections;
  const key = sections.map((s) => s.id).join("|");
  useEffect(() => {
    set({ sections: ref.current, active: ref.current[0]?.id ?? "" });
    return () => set(EMPTY);
  }, [key]);
}
