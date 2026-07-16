"use client";

import { useEffect, useState } from "react";

// Ticking 24h clock for the dashboard "GROUP OVERVIEW" strip (QUBIT App v3).
export function LiveClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-[10.5px] tabular-nums tracking-[1px] text-[var(--ink3)]">
      {time || "--:--:--"}
    </span>
  );
}
