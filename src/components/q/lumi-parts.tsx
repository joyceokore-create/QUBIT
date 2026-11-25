"use client";

import { useState } from "react";
import { Check, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { Markdown } from "@/components/q/markdown";
import type { LumiMsg } from "@/components/q/use-lumi-chat";

/** One assistant reply from Lumi: streamed text, what it's reading, an approval or a question, and thumbs. */
export function LumiReply({ msg, busy, onDecide, onAnswer, onRate }: { msg: LumiMsg; busy: boolean; onDecide: (approve: boolean) => void; onAnswer: (text: string) => void; onRate: (r: "up" | "down") => void }) {
  const [answer, setAnswer] = useState("");
  const p = msg.pending;
  return (
    <div className="mr-auto flex max-w-[92%] flex-col gap-2">
      {(msg.content || msg.failed) && (
        <div className="rounded-[14px] rounded-bl-[4px] border border-[var(--cardbd)] bg-[var(--cardbg)] px-3.5 py-2.5 backdrop-blur-[var(--glassblur)]">
          <Markdown text={msg.content} />
        </div>
      )}
      {msg.progress && (
        <div className="flex items-center gap-2 text-[12px] text-[var(--ink4)]">
          <Sparkles className="size-3.5 animate-pulse text-brand" aria-hidden /> {msg.progress}
        </div>
      )}
      {p && (
        <div className="flex flex-col gap-2 rounded-[12px] border border-[color-mix(in_oklab,var(--brand)_35%,transparent)] bg-[color-mix(in_oklab,var(--brand)_6%,transparent)] px-3.5 py-3" role="group" aria-label={p.type === "approval" ? "Change waiting for your approval" : "The assistant's question"}>
          <p className="text-[12.5px] font-semibold text-[var(--qink)]">{p.text || (p.type === "approval" ? "Make this change?" : "The assistant has a question.")}</p>
          {p.summary && <p className="text-[12px] text-[var(--ink3)]">{p.summary}</p>}
          {p.answered ? (
            <p className="text-[11.5px] text-[var(--ink4)]">Answered.</p>
          ) : p.type === "approval" ? (
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => onDecide(true)} className="inline-flex items-center gap-1 rounded-full bg-[var(--brand)] px-3 py-1.5 text-[12px] font-bold text-[var(--onbrand)] disabled:opacity-50">
                <Check className="size-3.5" aria-hidden /> Approve
              </button>
              <button type="button" disabled={busy} onClick={() => onDecide(false)} className="inline-flex items-center gap-1 rounded-full border border-[var(--hair)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink2)] disabled:opacity-50">
                <X className="size-3.5" aria-hidden /> Decline
              </button>
            </div>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (answer.trim()) onAnswer(answer.trim());
              }}
            >
              <input value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="Your answer" className="flex-1 rounded-full border border-[var(--hair)] bg-[var(--wash)] px-3 py-1.5 text-[12.5px] text-[var(--qink)] outline-none" />
              <button type="submit" disabled={busy || !answer.trim()} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-[12px] font-bold text-[var(--onbrand)] disabled:opacity-50">
                Send
              </button>
            </form>
          )}
        </div>
      )}
      {msg.done && msg.runId && msg.content && !msg.failed && (
        <div className="flex items-center gap-1 text-[var(--ink5)]">
          <button type="button" aria-label="Good answer" aria-pressed={msg.rated === "up"} disabled={Boolean(msg.rated)} onClick={() => onRate("up")} className={`rounded p-1 hover:text-brand ${msg.rated === "up" ? "text-brand" : ""}`}>
            <ThumbsUp className="size-3.5" />
          </button>
          <button type="button" aria-label="Bad answer" aria-pressed={msg.rated === "down"} disabled={Boolean(msg.rated)} onClick={() => onRate("down")} className={`rounded p-1 hover:text-brand ${msg.rated === "down" ? "text-brand" : ""}`}>
            <ThumbsDown className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
