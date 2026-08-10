"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// DM1.73 (Wave C, D3) — the wizard's Review step promises "everything can be changed
// later"; this dialog is where that promise is kept. Fields mirror exactly what
// PATCH /api/portfolios/[id] accepts (UpdatePortfolioSchema): name, description,
// category, viewKind, ownerId. Markets stay wizard-only for now. The page only renders
// this for holders of portfolio:create — the same key the route guards with.

const CATEGORIES = ["Approved", "Exploring", "Shelved"] as const;
const VIEW_KINDS = ["Pipeline", "Rollout"] as const;

const SELECT_CLS = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

export interface EditablePortfolio {
  id: string;
  name: string;
  description: string | null;
  category: string;
  viewKind: string;
  ownerId: string | null;
}

export function EditPortfolioDialog({
  portfolio,
  owners,
}: {
  portfolio: EditablePortfolio;
  /** Users eligible to own a portfolio (Head/Exec) — id + name, queried by the page. */
  owners: { id: string; name: string | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(portfolio.name);
  const [description, setDescription] = useState(portfolio.description ?? "");
  const [category, setCategory] = useState(portfolio.category);
  const [viewKind, setViewKind] = useState(portfolio.viewKind);
  const [ownerId, setOwnerId] = useState(portfolio.ownerId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch(`/api/portfolios/${portfolio.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        category,
        viewKind,
        ownerId: ownerId || null,
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not update portfolio.");
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Edit portfolio" />}>
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit portfolio</DialogTitle>
          <DialogDescription>Governance edits — changes are audited.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-portfolio-name" className="text-sm font-medium text-ink-2">
              Name
            </label>
            <Input id="edit-portfolio-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-portfolio-desc" className="text-sm font-medium text-ink-2">
              Description
            </label>
            <Input id="edit-portfolio-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="edit-portfolio-category" className="text-sm font-medium text-ink-2">
                Category
              </label>
              <select
                id="edit-portfolio-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={SELECT_CLS}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="edit-portfolio-viewkind" className="text-sm font-medium text-ink-2">
                View
              </label>
              <select
                id="edit-portfolio-viewkind"
                value={viewKind}
                onChange={(e) => setViewKind(e.target.value)}
                className={SELECT_CLS}
              >
                {VIEW_KINDS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-portfolio-owner" className="text-sm font-medium text-ink-2">
              Owner
            </label>
            <select
              id="edit-portfolio-owner"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">— no owner —</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name ?? "Unnamed"}
                </option>
              ))}
            </select>
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
