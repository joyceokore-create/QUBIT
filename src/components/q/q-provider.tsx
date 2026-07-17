"use client";

import { createContext, useContext, useState } from "react";

// A specific report to run the moment the drawer opens (context-aware "Ask Q about
// this project/portfolio" entry points). Null = open to the suggestion home.
export interface QPending {
  type: "project" | "resource" | "portfolio";
  targetId?: string;
  label?: string;
}

interface QState {
  open: boolean;
  userId: string;
  roles: string[];
  pending: QPending | null;
  /** Open Q to the suggestion home. */
  openQ: () => void;
  /** Open Q straight into a specific report (from a project/portfolio panel). */
  openQWith: (ctx: QPending) => void;
  closeQ: () => void;
  clearPending: () => void;
}

const QContext = createContext<QState | null>(null);

export function QProvider({ userId, roles, children }: { userId: string; roles: string[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<QPending | null>(null);
  return (
    <QContext.Provider
      value={{
        open,
        userId,
        roles,
        pending,
        openQ: () => {
          setPending(null);
          setOpen(true);
        },
        openQWith: (ctx) => {
          setPending(ctx);
          setOpen(true);
        },
        closeQ: () => setOpen(false),
        clearPending: () => setPending(null),
      }}
    >
      {children}
    </QContext.Provider>
  );
}

export function useQ(): QState {
  const ctx = useContext(QContext);
  if (!ctx) throw new Error("useQ must be used within QProvider");
  return ctx;
}
