"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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

interface NewProjectDialogProps {
  portfolioId: string;
  programmes: { id: string; name: string }[];
}

export function NewProjectDialog({ portfolioId, programmes }: NewProjectDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [status, setStatus] = useState("Planning");
  const [programmeId, setProgrammeId] = useState<string>("none");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setCode("");
    setName("");
    setDescription("");
    setPriority("Medium");
    setStatus("Planning");
    setProgrammeId("none");
    setBudget("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        name,
        description: description || null,
        type: "Project",
        priority,
        status,
        budget: budget || null,
        portfolioId,
        programmeId: programmeId === "none" ? null : programmeId,
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not create project.");
      return;
    }

    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus /> New project
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Creates a project in this portfolio.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="new-project-code" className="text-sm font-medium text-ink-2">
                Code
              </label>
              <Input id="new-project-code" required value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="flex flex-[2] flex-col gap-1.5">
              <label htmlFor="new-project-name" className="text-sm font-medium text-ink-2">
                Name
              </label>
              <Input id="new-project-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-project-description" className="text-sm font-medium text-ink-2">
              Description <span className="text-ink-3">(optional)</span>
            </label>
            <Input
              id="new-project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Priority</span>
              <Select value={priority} onValueChange={(v) => setPriority(v ?? "Medium")}>
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
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Status</span>
              <Select value={status} onValueChange={(v) => setStatus(v ?? "Planning")}>
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
          </div>

          {programmes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Programme</span>
              <Select
                value={programmeId}
                onValueChange={(v) => setProgrammeId(v ?? "none")}
                items={{ none: "None — standalone in this portfolio", ...Object.fromEntries(programmes.map((p) => [p.id, p.name])) }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None — standalone in this portfolio</SelectItem>
                  {programmes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-project-budget" className="text-sm font-medium text-ink-2">
              Budget <span className="text-ink-3">(optional, e.g. &ldquo;KES 50M&rdquo;)</span>
            </label>
            <Input id="new-project-budget" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </div>

          {error && (
            <p role="alert" className="text-sm text-status-red">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
