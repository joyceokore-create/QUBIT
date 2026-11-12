"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError } from "@/components/ui/drawer";
import { Banner } from "@/components/ui/panel";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { readApiError } from "@/lib/form-errors";
import { EditPortfolioFormSchema } from "@/lib/portfolio-schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/drawer-dialog";

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

  // docs/08 § Errors: Name and Description show their problems on the field; Save stays enabled.
  const fe = useFieldErrors({ schema: EditPortfolioFormSchema, values: { name, description }, idPrefix: "edit-portfolio" });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fe.validate()) return;
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
      const { message, fields } = readApiError(await res.json().catch(() => null), "Could not update the portfolio.");
      const { _: root, ...onFields } = fields;
      if (Object.keys(onFields).length > 0) {
        fe.setServerErrors(onFields, ["name", "description", "ownerId"]);
        if (root) setError(root);
      } else setError(message);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setError(null); fe.reset(); } }}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Edit portfolio" />}>
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Portfolio</DialogTitle>
          <DialogDescription>Governance edits — changes are audited.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error && <Banner tone="bad">{error}</Banner>}
          <Field label="Name" htmlFor={fe.idOf("name")} error={fe.errors.name}>
            <Input {...fe.bind("name")} required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label="Description" htmlFor={fe.idOf("description")} error={fe.errors.description}>
            <Input {...fe.bind("description")} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

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
              aria-invalid={fe.errors.ownerId ? true : undefined}
              aria-describedby={fe.errors.ownerId ? "edit-portfolio-owner-error" : undefined}
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
            {fe.errors.ownerId && <FieldError id="edit-portfolio-owner-error">{fe.errors.ownerId}</FieldError>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
