"use client";

import { useState, type FormEvent } from "react";
import { Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { projectRoleCategory } from "@/lib/roles";

const SEVERITIES = ["Low", "Medium", "High", "Critical"] as const;

// Structure QA is asked to fill in — a bug a developer can act on without a call-back.
const STEPS_TEMPLATE = `Steps to reproduce:
1.

Expected:

Actual:

Environment / build:
`;

interface MemberOpt {
  userId: string;
  name: string;
  role: string;
}
interface TaskOpt {
  id: string;
  title: string;
  taskKey: string | null;
}

/** QA bug filing (Phase 6.2): typed Bug with severity, repro template, a developer assignee
 * (dropdown filtered to Dev-category members) and optionally the task it was found under. */
export function BugDialog({
  projectId,
  members,
  tasks,
  onAdded,
}: {
  projectId: string;
  members: MemberOpt[];
  tasks: TaskOpt[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<string>("Medium");
  const [assigneeId, setAssigneeId] = useState<string>("none");
  const [parentTaskId, setParentTaskId] = useState<string>("none");
  const [description, setDescription] = useState(STEPS_TEMPLATE);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const devs = members.filter((m) => projectRoleCategory(m.role) === "Dev");
  const assignees = devs.length ? devs : members; // small teams: fall back to everyone

  function reset() {
    setTitle("");
    setSeverity("Medium");
    setAssigneeId("none");
    setParentTaskId("none");
    setDescription(STEPS_TEMPLATE);
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tasks: [
          {
            title: title.trim(),
            type: "Bug",
            severity,
            description: description.trim() || null,
            assigneeId: assigneeId === "none" ? null : assigneeId,
            parentTaskId: parentTaskId === "none" ? null : parentTaskId,
          },
        ],
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setError(b?.error?.message ?? "Could not file the bug.");
      return;
    }
    setOpen(false);
    reset();
    onAdded();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold"
            style={{ color: "var(--bad)", background: "color-mix(in oklab, var(--bad) 12%, transparent)" }}
          />
        }
      >
        <Bug className="size-3.5" /> Report bug
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report a bug</DialogTitle>
          <DialogDescription>
            Filed as a typed Bug task — you&apos;ll be notified when it&apos;s ready to verify.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bug-title" className="text-sm font-medium text-ink-2">Title</label>
            <Input id="bug-title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What breaks, in one line" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Severity</span>
              <Select value={severity} onValueChange={(v) => v && setSeverity(v)} items={Object.fromEntries(SEVERITIES.map((s) => [s, s]))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Assign to</span>
              <Select
                value={assigneeId}
                onValueChange={(v) => v && setAssigneeId(v)}
                items={{ none: "Triage (unassigned)", ...Object.fromEntries(assignees.map((m) => [m.userId, `${m.name} · ${m.role}`])) }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Triage (unassigned)</SelectItem>
                  {assignees.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>{m.name} · {m.role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {tasks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Found while testing <span className="text-ink-3">(optional)</span></span>
              <Select
                value={parentTaskId}
                onValueChange={(v) => v && setParentTaskId(v)}
                items={{ none: "—", ...Object.fromEntries(tasks.map((t) => [t.id, t.taskKey ? `${t.taskKey} · ${t.title}` : t.title])) }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {tasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.taskKey ? `${t.taskKey} · ${t.title}` : t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="bug-steps" className="text-sm font-medium text-ink-2">Steps to reproduce</label>
            <textarea
              id="bug-steps"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={7}
              className="rounded-[8px] border border-ink-4 bg-background p-2.5 font-mono text-[12px] leading-relaxed text-foreground outline-none focus:border-brand"
            />
          </div>

          {error && <p role="alert" className="text-sm text-status-red">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={loading || !title.trim()}>
              {loading ? "Filing…" : "File bug"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
