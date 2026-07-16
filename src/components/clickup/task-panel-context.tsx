"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Task panel state (mirrors the PPM panel-context pattern). The panel is rendered
 * once in the spaces layout; any row can open it by task id without prop-drilling.
 */
interface TaskPanelValue {
  openId: string | null;
  open: (taskId: string) => void;
  close: () => void;
}

const TaskPanelContext = createContext<TaskPanelValue | null>(null);

export function TaskPanelProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const value = useMemo<TaskPanelValue>(
    () => ({
      openId,
      open: (taskId: string) => setOpenId(taskId),
      close: () => setOpenId(null),
    }),
    [openId],
  );
  return <TaskPanelContext.Provider value={value}>{children}</TaskPanelContext.Provider>;
}

export function useTaskPanel(): TaskPanelValue {
  const ctx = useContext(TaskPanelContext);
  if (!ctx) throw new Error("useTaskPanel must be used within TaskPanelProvider");
  return ctx;
}
