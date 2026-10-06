"use client";

import { useEffect, useState } from "react";

// Milestone B — a timestamp rendered in the viewer's own zone, AFTER mount: QUBIT is used
// across markets, and formatting during SSR would hydrate "Thu 14:02" against the
// server's clock. Until mounted it renders nothing (the surrounding copy still reads).
export function LocalTime({ iso, format }: { iso: string; format: "weekday-time" | "date" | "date-time" }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions =
      format === "weekday-time"
        ? { weekday: "short", hour: "2-digit", minute: "2-digit" }
        : format === "date"
          ? { weekday: "short", day: "numeric", month: "short" }
          : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
    setText(d.toLocaleString("en-GB", opts));
  }, [iso, format]);
  return <time dateTime={iso}>{text}</time>;
}
