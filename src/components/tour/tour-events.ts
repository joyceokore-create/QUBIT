import type { TourEvent } from "@/lib/tour";

/** Components announce the real thing happening; the tour listens and ticks the step. */
export const TOUR_EVENT = "qubit:tour";

export function dispatchTourEvent(event: TourEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<{ event: TourEvent }>(TOUR_EVENT, { detail: { event } }));
}
