"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

// Shown on a project a viewer isn't part of (PROMPT §5). Sends a join request for the project's
// lead/PM to approve; on approval they become a member (Executives default to Stakeholder).
export function RequestToJoinButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function request() {
    setState("busy");
    setMsg("");
    try {
      const res = await fetch(`/api/projects/${projectId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setState("error");
        setMsg(body?.error?.message ?? "Couldn't send the request.");
        return;
      }
      setState("sent");
      router.refresh();
    } catch {
      setState("error");
      setMsg("Couldn't send the request.");
    }
  }

  if (state === "sent") {
    return (
      <span className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold" style={{ color: "var(--ok)", background: "color-mix(in oklab, var(--ok) 12%, transparent)" }}>
        Request sent — awaiting the lead&apos;s approval
      </span>
    );
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={request}
        disabled={state === "busy"}
        className="flex items-center gap-1.5 rounded-full border border-[var(--hair)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--ink2)] transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
      >
        <UserPlus className="size-3.5" /> {state === "busy" ? "Sending…" : "Request to join"}
      </button>
      {state === "error" && <span className="text-[10.5px] text-[var(--bad)]">{msg}</span>}
    </span>
  );
}
