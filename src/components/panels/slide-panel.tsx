"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { usePanel } from "@/components/panels/panel-context";
import { ProgrammePanelContent, type ProgrammePanelJson } from "@/components/panels/programme-panel-content";

// Programme-only slide-over. Projects open their full workspace page (see panel-context);
// clicking a project inside a programme panel navigates there too (openProject).
export function SlidePanel() {
  const { state, close, openProject } = usePanel();
  const [data, setData] = useState<ProgrammePanelJson | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/programmes/${state.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load this item.");
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this item.");
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

  return (
    <Sheet open={!!state} onOpenChange={(open) => !open && close()}>
      <SheetContent side="right" className="w-[660px] gap-0 overflow-hidden p-0 sm:max-w-[660px]">
        {/* SheetContent requires an accessible title; the real one renders inside the panel header. */}
        <SheetTitle className="sr-only">Details panel</SheetTitle>
        {error && <p className="p-[26px] text-sm text-status-red">{error}</p>}
        {!error && !data && <PanelSkeleton />}
        {!error && data && <ProgrammePanelContent data={data} onProjectClick={openProject} />}
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
