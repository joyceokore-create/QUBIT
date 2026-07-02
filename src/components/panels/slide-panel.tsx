"use client";

import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { usePanel } from "@/components/panels/panel-context";
import { ProjectPanelContent, type ProjectPanelJson } from "@/components/panels/project-panel-content";
import {
  ProgrammePanelContent,
  type ProgrammePanelJson,
} from "@/components/panels/programme-panel-content";

type PanelData =
  | { type: "project"; data: ProjectPanelJson }
  | { type: "programme"; data: ProgrammePanelJson };

export function SlidePanel() {
  const { state, close, openProject } = usePanel();
  const [panelData, setPanelData] = useState<PanelData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((keepData: boolean) => {
    if (!state) {
      setPanelData(null);
      setError(null);
      return () => {};
    }

    let cancelled = false;
    if (!keepData) setPanelData(null);
    setError(null);

    const url = state.type === "project" ? `/api/projects/${state.id}` : `/api/programmes/${state.id}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load this item.");
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setPanelData(
          state.type === "project" ? { type: "project", data: json } : { type: "programme", data: json },
        );
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this item.");
      });

    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(() => {
    return load(false);
  }, [load]);

  const refetch = useCallback(() => {
    load(true);
  }, [load]);

  return (
    <Sheet open={!!state} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="right"
        className="w-[660px] gap-0 overflow-hidden p-0 sm:max-w-[660px]"
      >
        {/* SheetContent requires an accessible title; the real one renders inside each
            panel's own header once data loads. */}
        <SheetTitle className="sr-only">Details panel</SheetTitle>
        {error && <p className="p-[26px] text-sm text-status-red">{error}</p>}
        {!error && !panelData && <PanelSkeleton />}
        {!error && panelData?.type === "project" && (
          <ProjectPanelContent data={panelData.data} onUpdated={refetch} />
        )}
        {!error && panelData?.type === "programme" && (
          <ProgrammePanelContent data={panelData.data} onProjectClick={openProject} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-[22px] p-[22px_26px]">
      <div className="h-4 w-24 animate-pulse rounded bg-background" />
      <div className="h-6 w-2/3 animate-pulse rounded bg-background" />
      <div className="grid grid-cols-4 gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-[6px] bg-background" />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-[6px] bg-background" />
    </div>
  );
}
