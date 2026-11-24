"use client";

import { useState, type FormEvent } from "react";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { Field } from "@/components/ui/drawer";
import { Banner } from "@/components/ui/panel";
import { NewRiskFormSchema } from "@/lib/risk-schema";
import { readApiError } from "@/lib/form-errors";
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
} from "@/components/ui/drawer-dialog";
import type { AdminUserSummary } from "@/server/users";

interface NewRiskDialogProps {
  users: AdminUserSummary[];
  projects: { id: string; code: string; name: string }[];
}

export function NewRiskDialog({ users, projects, defaultOpen = false }: NewRiskDialogProps & { defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [probability, setProbability] = useState("3");
  const [impact, setImpact] = useState("3");
  const [mitigation, setMitigation] = useState("");
  const [ownerId, setOwnerId] = useState("none");
  const [projectId, setProjectId] = useState("none");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // docs/08 § Errors: problems show on their field; the button stays enabled.
  const fe = useFieldErrors({
    schema: NewRiskFormSchema,
    values: { title, probability: Number(probability), impact: Number(impact) },
    idPrefix: "new-risk",
  });

  function reset() {
    setTitle("");
    setCategory("");
    setProbability("3");
    setImpact("3");
    setMitigation("");
    setOwnerId("none");
    setProjectId("none");
    setError(null);
    fe.reset();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fe.validate()) return;
    setLoading(true);

    const res = await fetch("/api/risks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        category: category || null,
        probability: Number(probability),
        impact: Number(impact),
        mitigation: mitigation || null,
        ownerId: ownerId === "none" ? null : ownerId,
        projectId: projectId === "none" ? null : projectId,
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const { message, fields } = readApiError(await res.json().catch(() => null), "Could not create the risk.");
      const { _: root, ...onFields } = fields;
      if (Object.keys(onFields).length > 0) {
        fe.setServerErrors(onFields, ["title", "projectId", "probability", "impact", "ownerId"]);
        if (root) setError(root);
      } else {
        setError(message);
      }
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
      <DialogTrigger render={<Button />}>
        <Plus /> New Risk
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Risk</DialogTitle>
          <DialogDescription>Adds a risk to the register.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error && <Banner tone="bad">{error}</Banner>}
          <Field label="Title" htmlFor={fe.idOf("title")} error={fe.errors.title}>
            <Input {...fe.bind("title")} required value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="new-risk-category" className="text-sm font-medium text-ink-2">
                Category <span className="text-ink-3">(optional)</span>
              </label>
              <Input
                id="new-risk-category"
                placeholder="e.g. Operational, Pilot/Test Area"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Project</span>
              <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "none")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Probability (1–5)</span>
              <Select value={probability} onValueChange={(v) => setProbability(v ?? "3")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Impact (1–5)</span>
              <Select value={impact} onValueChange={(v) => setImpact(v ?? "3")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-risk-mitigation" className="text-sm font-medium text-ink-2">
              Mitigation <span className="text-ink-3">(optional)</span>
            </label>
            <Input id="new-risk-mitigation" value={mitigation} onChange={(e) => setMitigation(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-2">Owner</span>
            <Select
              value={ownerId}
              onValueChange={(v) => setOwnerId(v ?? "none")}
              items={{ none: "None", ...Object.fromEntries(users.map((u) => [u.id, u.name])) }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating…" : "Create Risk"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
