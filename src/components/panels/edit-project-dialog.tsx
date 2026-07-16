"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES = ["Planning", "OnTrack", "AtRisk", "Overdue", "Completed", "Cancelled"];

interface EditableProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  budget: string | null;
  client: string | null;
  objective: string | null;
  mission: string | null;
  businessOwner: string | null;
  startDate: string | null;
}

interface EditProjectDialogProps {
  project: EditableProject;
  onUpdated: () => void;
}

export function EditProjectDialog({ project, onUpdated }: EditProjectDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [status, setStatus] = useState(project.status);
  const [priority, setPriority] = useState(project.priority);
  const [dueDate, setDueDate] = useState(project.dueDate ? project.dueDate.slice(0, 10) : "");
  const [startDate, setStartDate] = useState(project.startDate ? project.startDate.slice(0, 10) : "");
  const [budget, setBudget] = useState(project.budget ?? "");
  const [client, setClient] = useState(project.client ?? "");
  const [businessOwner, setBusinessOwner] = useState(project.businessOwner ?? "");
  const [objective, setObjective] = useState(project.objective ?? "");
  const [mission, setMission] = useState(project.mission ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || null,
        status,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        budget: budget || null,
        client: client || null,
        businessOwner: businessOwner || null,
        objective: objective || null,
        mission: mission || null,
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not update project.");
      return;
    }

    setOpen(false);
    onUpdated();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Edit project" />}>
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>Changes are audited.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-project-name" className="text-sm font-medium text-ink-2">
              Name
            </label>
            <Input id="edit-project-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-project-desc" className="text-sm font-medium text-ink-2">
              Description
            </label>
            <Input id="edit-project-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="edit-project-client" className="text-sm font-medium text-ink-2">Client</label>
              <Input id="edit-project-client" value={client} onChange={(e) => setClient(e.target.value)} />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="edit-project-owner" className="text-sm font-medium text-ink-2">Business owner</label>
              <Input id="edit-project-owner" value={businessOwner} onChange={(e) => setBusinessOwner(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-project-obj" className="text-sm font-medium text-ink-2">Objective</label>
            <Input id="edit-project-obj" value={objective} onChange={(e) => setObjective(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-project-mission" className="text-sm font-medium text-ink-2">Mission statement</label>
            <Input id="edit-project-mission" value={mission} onChange={(e) => setMission(e.target.value)} />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Status</span>
              <Select value={status} onValueChange={(v) => setStatus(v ?? status)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Priority</span>
              <Select value={priority} onValueChange={(v) => setPriority(v ?? priority)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="edit-project-start" className="text-sm font-medium text-ink-2">Start date</label>
              <Input id="edit-project-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="edit-project-due" className="text-sm font-medium text-ink-2">End date</label>
              <Input id="edit-project-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-project-budget" className="text-sm font-medium text-ink-2">
              Budget
            </label>
            <Input id="edit-project-budget" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </div>

          {error && (
            <p role="alert" className="text-sm text-status-red">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
