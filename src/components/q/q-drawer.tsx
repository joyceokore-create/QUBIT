"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Sparkles, X } from "lucide-react";
import { QubitLogo } from "@/components/brand/qubit-logo";
import { Markdown } from "@/components/q/markdown";
import { useQ } from "@/components/q/q-provider";
import { qSuggestionChips } from "@/lib/q-chips";

type ReportType = "project" | "resource" | "portfolio" | "manager" | "member";
interface ProjectOpt {
  id: string;
  code: string;
  name: string;
}
interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export function QDrawer({ canReports = false }: { canReports?: boolean }) {
  const { open, closeQ, userId, roles, pending, clearPending } = useQ();
  const [view, setView] = useState<"home" | "picker" | "loading" | "report" | "chat">("home");
  const [markdown, setMarkdown] = useState("");
  const [usedAi, setUsedAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectId, setProjectId] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // On open: run the pending context report ("Ask Q about this project") straight
  // away, otherwise show the suggestion home.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (pending) {
      const { type, targetId } = pending;
      clearPending();
      void generate(type, targetId);
    } else {
      setView("home");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeQ();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeQ]);

  async function generate(type: ReportType, targetId?: string) {
    setView("loading");
    setError(null);
    try {
      const res = await fetch("/api/q/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, targetId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn’t generate that report.");
      setMarkdown(json.markdown);
      setUsedAi(Boolean(json.usedAi));
      setView("report");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setView("home");
    }
  }

  async function sendChat(text: string) {
    const q = text.trim();
    if (!q || chatBusy) return;
    const next: ChatMsg[] = [...chat, { role: "user", content: q }];
    setChat(next);
    setChatInput("");
    setChatBusy(true);
    setView("chat");
    setError(null);
    try {
      const res = await fetch("/api/q/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const json = await res.json();
      setChat([...next, { role: "assistant", content: json.reply ?? "…" }]);
    } catch {
      setChat([...next, { role: "assistant", content: "Q hit an error reaching the model. Please try again." }]);
    } finally {
      setChatBusy(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
    }
  }

  async function openProjectPicker() {
    setView("picker");
    if (projects.length === 0) {
      try {
        const res = await fetch("/api/projects");
        const json = await res.json();
        const items: ProjectOpt[] = (json.items ?? []).map((p: ProjectOpt) => ({
          id: p.id,
          code: p.code,
          name: p.name,
        }));
        setProjects(items);
        if (items[0]) setProjectId(items[0].id);
      } catch {
        setError("Couldn’t load projects.");
        setView("home");
      }
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] [animation:scrimIn_.25s_ease_both]"
        style={{ background: "var(--scrim)" }}
        onClick={closeQ}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label="Q copilot"
        className="fixed bottom-[10px] right-[10px] top-[10px] z-[61] flex w-[430px] max-w-[calc(100%-20px)] flex-col overflow-hidden rounded-[18px] border border-[var(--cardbd)] bg-[var(--qbg)] [animation:drawerIn_.3s_cubic-bezier(.22,1,.36,1)_both]"
        style={{ boxShadow: "0 24px 80px rgba(0,0,0,.35)" }}
      >
        {/* Header */}
        <div className="relative flex items-center gap-2.5 border-b border-[var(--hair)] p-[16px_20px]">
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(500px 160px at 8% -60%, color-mix(in oklab, var(--brand) 16%, transparent), transparent 65%)" }} />
          <span className="relative flex size-7 items-center justify-center">
            <QubitLogo square={8} gap={2} radius={2} color="var(--brand)" />
          </span>
          <div className="relative flex-1">
            <div className="font-heading text-[15px] font-bold text-[var(--qink)]">Ask Q</div>
            <div className="font-mono text-[8.5px] uppercase tracking-[1.8px] text-[var(--ink4)]">Your delivery copilot</div>
          </div>
          <button
            type="button"
            onClick={closeQ}
            aria-label="Close"
            className="relative flex size-7 items-center justify-center rounded-full border border-[var(--hair)] text-[var(--ink3)] transition-colors hover:border-brand hover:text-brand"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-3 rounded-lg border border-[color-mix(in_oklab,var(--bad)_45%,transparent)] bg-[color-mix(in_oklab,var(--bad)_12%,transparent)] px-3 py-2 text-[12.5px] text-[var(--bad)]">
              {error}
            </div>
          )}

          {view === "home" && (
            <div className="flex flex-col gap-4">
              <p className="text-[13px] leading-[1.5] text-[var(--ink3)]">
                I summarise your portfolio, a project, or a person’s workload — using only your organisation’s data.
              </p>
              <div className="flex flex-col gap-2">
                <div className="font-mono text-[8.5px] uppercase tracking-[1.8px] text-[var(--ink5)]">Suggested</div>
                <Chip label="My work" hint="Your projects, and risks & blockers you own" onClick={() => generate("member", userId)} />
                {canReports && (
                  <>
                    <Chip label="Portfolio summary" hint="Executive: health, what needs attention, milestones" onClick={() => generate("portfolio")} />
                    <Chip label="Manager report" hint="Tasks by status, open risks & blockers, workload" onClick={() => generate("manager")} />
                    <Chip label="Report on a project" hint="Status, resources, risks & issues" onClick={openProjectPicker} />
                  </>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="font-mono text-[8.5px] uppercase tracking-[1.8px] text-[var(--ink5)]">Try asking</div>
                {qSuggestionChips(roles).map((c) => (
                  <Chip key={c.label} label={c.label} onClick={() => void sendChat(c.prompt)} />
                ))}
              </div>
              <p className="text-[11.5px] leading-[1.5] text-[var(--ink5)]">
                …or ask me anything below — I’ll look it up across your projects, tasks, risks, blockers, docs and connected
                tools. For downloadable &amp; shareable weekly/monthly reports, visit{" "}
                <a href="/reports" className="font-semibold text-brand hover:underline">Reports</a>.
              </p>
            </div>
          )}

          {view === "chat" && (
            <div className="flex flex-col gap-3">
              {chat.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="ml-auto max-w-[85%] rounded-[14px] rounded-br-[4px] bg-[color-mix(in_oklab,var(--brand)_16%,transparent)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--qink)]">
                    {m.content}
                  </div>
                ) : (
                  <div key={i} className="mr-auto max-w-[92%] rounded-[14px] rounded-bl-[4px] border border-[var(--cardbd)] bg-[var(--cardbg)] px-3.5 py-2.5 backdrop-blur-[var(--glassblur)]">
                    <Markdown text={m.content} />
                  </div>
                ),
              )}
              {chatBusy && (
                <div className="mr-auto flex items-center gap-2 text-[12px] text-[var(--ink4)]">
                  <Sparkles className="size-3.5 animate-pulse text-brand" /> Q is looking that up…
                </div>
              )}
            </div>
          )}

          {view === "picker" && (
            <div className="flex flex-col gap-3">
              <BackButton onClick={() => setView("home")} />
              <label className="font-mono text-[9px] font-semibold uppercase tracking-[1.8px] text-[var(--ink4)]" htmlFor="q-project">
                Choose a project
              </label>
              <select
                id="q-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="rounded-[10px] border border-[var(--hair)] bg-[var(--wash)] px-3 py-2 text-[13px] text-[var(--qink)] outline-none focus:border-brand"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!projectId}
                onClick={() => generate("project", projectId)}
                className="mt-1 flex items-center justify-center gap-2 rounded-full bg-[var(--brand)] px-4 py-2.5 text-[13px] font-bold text-[var(--onbrand)] disabled:opacity-50"
                style={{ boxShadow: "0 4px 16px color-mix(in oklab, var(--brand) var(--glowA), transparent)" }}
              >
                <Sparkles className="size-4" /> Generate report
              </button>
            </div>
          )}

          {view === "loading" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-[13px] text-[var(--ink3)]">
                <Sparkles className="size-4 animate-pulse text-brand" /> Q is analysing your data…
              </div>
              {[80, 95, 70, 88, 60].map((w, i) => (
                <div key={i} className="h-3 rounded bg-[var(--wash2)] [animation:pulseGlow_1.6s_infinite]" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}

          {view === "report" && (
            <div className="flex flex-col gap-3">
              <BackButton onClick={() => setView("home")} label="Ask something else" />
              <div className="rounded-[14px] border border-[var(--cardbd)] bg-[var(--cardbg)] p-4 backdrop-blur-[var(--glassblur)]">
                <Markdown text={markdown} />
              </div>
              <div className="font-mono text-[8.5px] uppercase tracking-[1.4px] text-[var(--ink5)]">
                {usedAi
                  ? "Generated by Q from your tenant data · verify before sharing externally"
                  : "Generated deterministically from your live data (AI provider not configured)"}
              </div>
            </div>
          )}
        </div>

        {/* Composer — free-form agentic chat, always available */}
        {view !== "loading" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendChat(chatInput);
            }}
            className="flex items-center gap-2 border-t border-[var(--hair)] p-3"
          >
            {(view === "chat" || view === "report") && (
              <button
                type="button"
                onClick={() => {
                  setChat([]);
                  setView("home");
                }}
                aria-label="New chat"
                className="flex size-9 flex-none items-center justify-center rounded-full text-[var(--ink4)] transition-colors hover:bg-[var(--wash)] hover:text-brand"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask Q anything about the portfolio…"
              className="flex-1 rounded-full border border-[var(--hair)] bg-[var(--wash)] px-4 py-2.5 text-[12.5px] text-[var(--qink)] outline-none focus:border-[color-mix(in_oklab,var(--brand)_50%,transparent)]"
            />
            <button
              type="submit"
              disabled={chatBusy || !chatInput.trim()}
              aria-label="Send"
              className="flex size-[38px] flex-none items-center justify-center rounded-full bg-[var(--brand)] text-[var(--onbrand)] disabled:opacity-50"
              style={{ boxShadow: "0 4px 16px color-mix(in oklab, var(--brand) var(--glowA), transparent)" }}
            >
              <Send className="size-4" />
            </button>
          </form>
        )}
      </aside>
    </>
  );
}

function Chip({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-0.5 rounded-[12px] border border-[var(--hair)] bg-[var(--wash)] p-3 text-left transition-[transform,border-color] duration-200 hover:translate-x-[3px] hover:border-[color-mix(in_oklab,var(--brand)_45%,transparent)]"
    >
      <span className="text-[13px] font-semibold text-[var(--qink)]">{label}</span>
      {hint && <span className="text-[11px] text-[var(--ink4)]">{hint}</span>}
    </button>
  );
}

function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-fit items-center gap-1 text-[12px] font-semibold text-[var(--ink4)] transition-colors hover:text-brand"
    >
      <ArrowLeft className="size-3.5" /> {label}
    </button>
  );
}
