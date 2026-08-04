"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AdminFormDialog } from "@/components/admin/admin-form-dialog";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { Chip } from "@/components/wizard/wizard-shell";

// M-P1b (docs/26 §5.2) — programme creation is deliberately ONE card: it exists to
// group. If you're reaching for more fields here, the thing you want is a project.
export function NewProgrammeDialog({ portfolioId }: { portfolioId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Exploring");
  const { busy, error, setError, mutate } = useAdminMutation();

  async function submit() {
    if (name.trim().length < 2) {
      setError("Name is required.");
      return;
    }
    await mutate(
      "/api/programmes",
      "POST",
      { name: name.trim(), portfolioId, category },
      {
        fallback: "Could not create the programme.",
        onSuccess: () => {
          setOpen(false);
          setName("");
          setCategory("Exploring");
        },
      },
    );
  }

  return (
    <AdminFormDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
      title="New programme"
      description="A grouping inside this portfolio — it inherits the portfolio's markets and report recipients."
      error={error}
      busy={busy}
      submitLabel="Create programme"
      onSubmit={submit}
      trigger={
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Plus /> New programme
        </DialogTrigger>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor="pg-name" className="text-[11px] font-semibold tracking-[0.6px] text-[var(--ink4)] uppercase">
            Name
          </label>
          <Input id="pg-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" autoFocus />
        </div>
        <div>
          <span className="text-[11px] font-semibold tracking-[0.6px] text-[var(--ink4)] uppercase">Category</span>
          <div className="mt-2">
            {["Approved", "Exploring", "Shelved"].map((c) => (
              <Chip key={c} on={category === c} onClick={() => setCategory(c)}>
                {c}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </AdminFormDialog>
  );
}
