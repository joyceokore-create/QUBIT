"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type PanelState = { type: "project" | "programme"; id: string } | null;

interface PanelContextValue {
  state: PanelState;
  openProject: (id: string) => void;
  openProgramme: (id: string) => void;
  close: () => void;
}

const PanelContext = createContext<PanelContextValue | null>(null);

/** Wraps the authenticated app so any page can open the project/programme slide panel
 * without prop-drilling — the panel itself is rendered once, in the (app) layout. */
export function SlidePanelStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PanelState>(null);

  const value = useMemo<PanelContextValue>(
    () => ({
      state,
      openProject: (id) => setState({ type: "project", id }),
      openProgramme: (id) => setState({ type: "programme", id }),
      close: () => setState(null),
    }),
    [state],
  );

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanel(): PanelContextValue {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error("usePanel must be used within SlidePanelStateProvider");
  return ctx;
}
