"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

// Programmes still use the slide-over (they have no full page); PROJECTS now open their full
// workspace at /projects/[id] (per Joyce) — so openProject navigates instead of opening a panel.
type PanelState = { type: "programme"; id: string } | null;

interface PanelContextValue {
  state: PanelState;
  openProject: (id: string) => void;
  openProgramme: (id: string) => void;
  close: () => void;
}

const PanelContext = createContext<PanelContextValue | null>(null);

/** Wraps the authenticated app so any page can open the programme slide panel, or navigate to a
 * project's full workspace, without prop-drilling. The panel itself renders once in the layout. */
export function SlidePanelStateProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<PanelState>(null);

  const value = useMemo<PanelContextValue>(
    () => ({
      state,
      // Close any open panel and go to the full project workspace.
      openProject: (id) => {
        setState(null);
        router.push(`/projects/${id}`);
      },
      openProgramme: (id) => setState({ type: "programme", id }),
      close: () => setState(null),
    }),
    [state, router],
  );

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanel(): PanelContextValue {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error("usePanel must be used within SlidePanelStateProvider");
  return ctx;
}
