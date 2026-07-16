"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Task {
  id: string;
  title: string;
  description: string | null;
  phase: string | null;
  ownerRole: string | null;
  priority: string;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
}
interface MemberOpt {
  userId: string;
  name: string;
}
interface Progress {
  total: number;
  completed: number;
  inProgress: number;
  blocked: number;
  pct: number;
}
interface PlanTask {
  title: string;
  description: string;
  ownerRole: string;
  priority: string;
  estimate: string;
  phase: string;
  include: boolean;
}

const STATUSES = ["NotStarted", "InProgress", "Blocked", "Completed"] as const;
const STATUS_META: Record<string, { token: string; label: string }> = {
  NotStarted: { token: "--ink4", label: "Not started" },
  InProgress: { token: "--qinfo", label: "In progress" },
  Blocked: { token: "--bad", label: "Blocked" },
  Completed: { token: "--ok", label: "Completed" },
};

export function ProjectTasksSection({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<MemberOpt[]>([]);
  const [progress, setProgress] = useState<Progress>({ total: 0, completed: 0, inProgress: 0, blocked: 0, pct: 0 });
  const [genOpen, setGenOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const load = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/tasks`).then((r) => r.json());
    setTasks(d.tasks ?? []);
    setProgress(d.progress ?? { total: 0, completed: 0, inProgress: 0, blocked: 0, pct: 0 });
  }, [projectId]);

  useEffect(() => {
    void load();
    if (canEdit) {
      fetch(`/api/projects/${projectId}/members`).then((r) => r.json()).then((d) => setMembers(d.data ?? [])).catch(() => {});
    }
  }, [load, canEdit, projectId]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) void load();
  };
  const changeStatus = (id: string, status: string) => patch(id, { status });
  const remove = async (id: string) => {
    if (await fetch(`/api/tasks/${id}`, { method: "DELETE" }).then((r) => r.ok)) void load();
  };
  const addManual = async () => {
    if (!newTitle.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tasks: [{ title: newTitle.trim() }] }),
    });
    if (res.ok) {
      setNewTitle("");
      void load();
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold text-foreground">
          Tasks {progress.total > 0 && <span className="text-ink-3">· {progress.total}</span>}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setGenOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] px-3 py-1.5 text-[11.5px] font-semibold text-brand"
          >
            <Sparkles className="size-3.5" /> Generate from document
          </button>
        )}
      </div>

      {/* Auto progress (PRD Module 7) */}
      {progress.total > 0 && (
        <div>
          <div className="h-[6px] overflow-hidden rounded-full bg-[var(--w08)]">
            <div className="h-full rounded-full bg-[var(--ok)]" style={{ width: `${progress.pct}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-ink-3">
            {progress.completed}/{progress.total} done · {progress.pct}%
            {progress.blocked > 0 && <span className="text-[var(--bad)]"> · {progress.blocked} blocked</span>}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {tasks.map((t) => {
          const m = STATUS_META[t.status] ?? STATUS_META.NotStarted;
          const overdue = t.dueDate && t.status !== "Completed" && new Date(t.dueDate) < new Date();
          return (
            <div key={t.id} className="group flex flex-col gap-1.5 rounded-[6px] bg-background px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="size-[7px] flex-none rounded-full" style={{ background: `var(${m.token})` }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{t.title}</span>
                  <span className="block truncate text-[10.5px] text-ink-3">
                    {[t.phase, t.ownerRole, t.priority, t.assigneeName].filter(Boolean).join(" · ") || "—"}
                    {t.dueDate && (
                      <span style={{ color: overdue ? "var(--bad)" : undefined }}>
                        {" · due "}{new Date(t.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </span>
                </span>
                {!canEdit && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: `var(${m.token})`, background: `color-mix(in oklab, var(${m.token}) 14%, transparent)` }}>
                    {m.label}
                  </span>
                )}
                {canEdit && (
                  <button type="button" onClick={() => remove(t.id)} className="text-ink-3 opacity-0 hover:text-status-red group-hover:opacity-100" aria-label="Remove task">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1.5 pl-[15px]">
                  <Select
                    value={t.status}
                    onValueChange={(v) => v && changeStatus(t.id, v)}
                    items={Object.fromEntries(STATUSES.map((s) => [s, STATUS_META[s].label]))}
                  >
                    <SelectTrigger className="h-7 w-[120px] text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select
                    value={t.assigneeId ?? "none"}
                    onValueChange={(v) => v && patch(t.id, { assigneeId: v === "none" ? null : v })}
                    items={{ none: "Unassigned", ...Object.fromEntries(members.map((mem) => [mem.userId, mem.name])) }}
                  >
                    <SelectTrigger className="h-7 w-[130px] text-[11px]"><SelectValue placeholder="Assignee" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {members.map((mem) => <SelectItem key={mem.userId} value={mem.userId}>{mem.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <input
                    type="date"
                    value={t.dueDate ? t.dueDate.slice(0, 10) : ""}
                    onChange={(e) => patch(t.id, { dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    className="h-7 rounded-[6px] border border-ink-4 bg-background px-2 text-[11px] text-ink-2 outline-none focus:border-brand"
                  />
                </div>
              )}
            </div>
          );
        })}
        {tasks.length === 0 && <p className="text-xs text-ink-3">No tasks yet. Generate them from a document, or add one.</p>}
      </div>

      {canEdit && (
        <div className="flex items-center gap-2">
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Add a task…" className="h-8 flex-1 text-xs" onKeyDown={(e) => e.key === "Enter" && addManual()} />
          <button type="button" onClick={addManual} className="flex items-center gap-1 rounded-[8px] bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] px-3 py-1.5 text-xs font-semibold text-brand">
            <Plus className="size-3.5" /> Add
          </button>
        </div>
      )}

      {genOpen && <GenerateDialog projectId={projectId} onClose={() => setGenOpen(false)} onAdded={() => { setGenOpen(false); void load(); }} />}
    </div>
  );
}

export function GenerateDialog({ projectId, onClose, onAdded }: { projectId: string; onClose: () => void; onAdded: () => void }) {
  const [text, setText] = useState("");
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [phase, setPhase] = useState<"input" | "loading" | "preview" | "saving">("input");
  const [plan, setPlan] = useState<{ summary: string; risks: string[]; tasks: PlanTask[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    setPdfBase64(btoa(binary));
    setPdfName(file.name);
  }

  async function generate() {
    setError(null);
    setPhase("loading");
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.trim() || undefined, pdfBase64: pdfBase64 ?? undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Generation failed.");
      const flat: PlanTask[] = (json.plan.phases ?? []).flatMap((ph: { name: string; tasks: Omit<PlanTask, "phase" | "include">[] }) =>
        ph.tasks.map((t) => ({ ...t, phase: ph.name, include: true })),
      );
      setPlan({ summary: json.plan.summary ?? "", risks: json.plan.risks ?? [], tasks: flat });
      setPhase("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
      setPhase("input");
    }
  }

  async function approve() {
    if (!plan) return;
    const chosen = plan.tasks.filter((t) => t.include);
    if (chosen.length === 0) return;
    setPhase("saving");
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tasks: chosen.map((t) => ({
          title: t.title,
          description: t.description || null,
          phase: t.phase || null,
          ownerRole: t.ownerRole || null,
          priority: ["Low", "Medium", "High", "Critical"].includes(t.priority) ? t.priority : "Medium",
          estimate: t.estimate || null,
        })),
      }),
    });
    if (res.ok) onAdded();
    else {
      setError("Could not save tasks.");
      setPhase("preview");
    }
  }

  const toggle = (i: number) =>
    setPlan((p) => (p ? { ...p, tasks: p.tasks.map((t, idx) => (idx === i ? { ...t, include: !t.include } : t)) } : p));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Generate tasks from a document</DialogTitle>
          <DialogDescription>
            Paste your BRD / requirements or attach a PDF. Q drafts a phased task list for you to review and approve.
          </DialogDescription>
        </DialogHeader>

        {(phase === "input" || phase === "loading") && (
          <div className="flex flex-col gap-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste requirements / BRD text here…"
              rows={7}
              className="rounded-[10px] border border-ink-4 bg-background p-3 text-xs text-foreground outline-none focus:border-brand"
            />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-3">
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <span className="rounded-[8px] border border-dashed border-ink-4 px-3 py-1.5 hover:border-brand hover:text-brand">
                {pdfName ? `📄 ${pdfName}` : "Attach a PDF (optional)"}
              </span>
            </label>
            {error && <p className="text-xs text-status-red">{error}</p>}
            <div className="flex justify-end">
              <Button type="button" onClick={generate} disabled={phase === "loading" || (!text.trim() && !pdfBase64)}>
                <Sparkles className="size-4" /> {phase === "loading" ? "Analysing…" : "Generate"}
              </Button>
            </div>
          </div>
        )}

        {(phase === "preview" || phase === "saving") && plan && (
          <div className="flex flex-col gap-3">
            {plan.summary && <p className="text-xs leading-relaxed text-ink-2">{plan.summary}</p>}
            <div className="max-h-[320px] overflow-y-auto rounded-[10px] border border-ink-4">
              {plan.tasks.map((t, i) => (
                <label key={i} className="flex items-start gap-2.5 border-b border-background px-3 py-2 text-xs last:border-0">
                  <input type="checkbox" checked={t.include} onChange={() => toggle(i)} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">{t.title}</span>
                    <span className="block text-[10.5px] text-ink-3">
                      {[t.phase, t.ownerRole, t.priority, t.estimate].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              ))}
              {plan.tasks.length === 0 && <p className="p-3 text-xs text-ink-3">No tasks were derived.</p>}
            </div>
            {error && <p className="text-xs text-status-red">{error}</p>}
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setPhase("input")} className="flex items-center gap-1 text-xs text-ink-3 hover:text-brand">
                <X className="size-3.5" /> Back
              </button>
              <Button type="button" onClick={approve} disabled={phase === "saving" || !plan.tasks.some((t) => t.include)}>
                {phase === "saving" ? "Adding…" : `Approve & add ${plan.tasks.filter((t) => t.include).length}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
