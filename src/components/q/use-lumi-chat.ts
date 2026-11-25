"use client";

import { useRef, useState } from "react";
import { createSseParser } from "@/lib/sse";

/**
 * Plan Phase 5 — Ask Q's conversation with Lumi's in-product assistant. Every call goes to
 * QUBIT's own /api/assistant/* routes (the browser never holds a Lumi token); answers stream
 * as Lumi's events. Lumi acts as the signed-in person: reads run straight away, and every
 * change pauses as an approval the person decides here. When the assistant is off, send()
 * answers "off" so the drawer can fall back to the local Ask Q.
 */

export interface LumiPending {
  runId: string;
  pendingId: string;
  type: "approval" | "question";
  text: string;
  summary?: string;
  answered?: boolean;
}

export interface LumiMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  runId?: string;
  /** What Lumi is reading right now ("Looking at list projects…"). */
  progress?: string | null;
  pending?: LumiPending | null;
  done?: boolean;
  failed?: boolean;
  rated?: "up" | "down";
}

type Outcome = "ok" | "off" | "error";

let seq = 0;
const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

interface PendingPayload {
  pending_id?: string;
  type?: string;
  text?: string;
  action?: { summary?: string };
}

export function useLumiChat() {
  const [messages, setMessages] = useState<LumiMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const conversation = useRef<string | null>(null);

  const patch = (id: string, fn: (m: LumiMsg) => LumiMsg) => setMessages((all) => all.map((m) => (m.id === id ? fn(m) : m)));

  async function stream(url: string, body: unknown, msgId: string, knownRunId?: string): Promise<Outcome> {
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      patch(msgId, (m) => ({ ...m, failed: true, done: true, progress: null, content: m.content || "Couldn't reach the assistant. Try again." }));
      return "error";
    }
    if (!res.ok || !res.body) {
      const err = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      if (res.status === 409 && err?.error?.code === "ASSISTANT_OFF") return "off";
      patch(msgId, (m) => ({ ...m, failed: true, done: true, progress: null, content: err?.error?.message ?? "The assistant couldn't answer that." }));
      return "error";
    }
    let runId = knownRunId;
    const toPending = (p: PendingPayload | undefined): LumiPending | null =>
      p?.pending_id && runId ? { runId, pendingId: p.pending_id, type: p.type === "question" ? "question" : "approval", text: p.text ?? "", summary: p.action?.summary } : null;
    const parser = createSseParser(({ event, data }) => {
      const d = (data ?? {}) as Record<string, unknown>;
      if (event === "run.started") {
        runId = String(d.run_id ?? runId ?? "");
        if (typeof d.conversation_id === "string") conversation.current = d.conversation_id;
        patch(msgId, (m) => ({ ...m, runId }));
      } else if (event === "text.delta" && typeof d.text === "string") {
        const t = d.text;
        patch(msgId, (m) => ({ ...m, content: m.content + t, progress: null }));
      } else if (event === "tool.call" && typeof d.tool === "string") {
        const tool = d.tool.replace(/[._]/g, " ");
        patch(msgId, (m) => ({ ...m, progress: `Looking at ${tool}…` }));
      } else if (event === "run.paused") {
        const pending = toPending(d.pending as PendingPayload | undefined);
        patch(msgId, (m) => ({ ...m, pending, progress: null, done: true }));
      } else if (event === "run.completed") {
        const run = d as { status?: string; output?: { text?: string }; pending?: PendingPayload };
        const pending = run.status === "needs_approval" || run.status === "needs_context" ? toPending(run.pending) : null;
        patch(msgId, (m) => ({ ...m, content: m.content || run.output?.text || (run.status === "max_steps" ? "That took too many steps. Try a narrower question." : ""), pending: pending ?? m.pending ?? null, progress: null, done: true }));
      } else if (event === "error") {
        patch(msgId, (m) => ({ ...m, failed: true, done: true, progress: null, content: m.content || "The assistant couldn't finish that." }));
      }
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.end();
    patch(msgId, (m) => ({ ...m, done: true, progress: null }));
    return "ok";
  }

  /** Send a message. Answers "off" (nothing added) when the drawer should use the local Ask Q. */
  async function send(text: string): Promise<Outcome> {
    const user: LumiMsg = { id: newId(), role: "user", content: text };
    const reply: LumiMsg = { id: newId(), role: "assistant", content: "", progress: "Thinking…" };
    setMessages((all) => [...all, user, reply]);
    setBusy(true);
    const out = await stream("/api/assistant/runs", { message: text, ...(conversation.current ? { conversationId: conversation.current } : {}) }, reply.id);
    setBusy(false);
    if (out === "off") setMessages((all) => all.filter((m) => m.id !== user.id && m.id !== reply.id));
    return out;
  }

  async function resume(msg: LumiMsg, input: { approve: boolean } | { answer: string }) {
    if (!msg.pending || msg.pending.answered) return;
    const { runId, pendingId } = msg.pending;
    patch(msg.id, (m) => ({ ...m, pending: m.pending ? { ...m.pending, answered: true } : null }));
    const reply: LumiMsg = { id: newId(), role: "assistant", content: "", runId, progress: "approve" in input ? (input.approve ? "Making the change…" : "Leaving it…") : "Thinking…" };
    setMessages((all) => [...all, reply]);
    setBusy(true);
    await stream(`/api/assistant/runs/${encodeURIComponent(runId)}/resume`, { pendingId, ...input }, reply.id, runId);
    setBusy(false);
  }

  async function rate(msg: LumiMsg, rating: "up" | "down") {
    if (!msg.runId || msg.rated) return;
    patch(msg.id, (m) => ({ ...m, rated: rating }));
    await fetch(`/api/assistant/runs/${encodeURIComponent(msg.runId)}/feedback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating }) }).catch(() => undefined);
  }

  function reset() {
    setMessages([]);
    conversation.current = null;
  }

  return { messages, busy, send, decide: (m: LumiMsg, approve: boolean) => resume(m, { approve }), answer: (m: LumiMsg, text: string) => resume(m, { answer: text }), rate, reset };
}
