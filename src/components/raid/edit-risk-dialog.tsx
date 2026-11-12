"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Banner } from "@/components/ui/panel";
import { readApiError } from "@/lib/form-errors";
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
} from "@/components/ui/drawer-dialog";
import { RISK_STATUSES, type RiskListItem } from "@/server/risks";
import type { AdminUserSummary } from "@/server/users";

interface EditRiskDialogProps {
  risk: RiskListItem;
  users: AdminUserSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditRiskDialog({ risk, users, open, onOpenChange }: EditRiskDialogProps) {
  const router = useRouter();
  const [status, setStatus] = useState(risk.status);
  const [ownerId, setOwnerId] = useState(risk.ownerId ?? "none");
  const [mitigation, setMitigation] = useState(risk.mitigation ?? "");
  const [probability, setProbability] = useState(String(risk.probability));
  const [impact, setImpact] = useState(String(risk.impact));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setStatus(risk.status);
      setOwnerId(risk.ownerId ?? "none");
      setMitigation(risk.mitigation ?? "");
      setProbability(String(risk.probability));
      setImpact(String(risk.impact));
      setError(null);
    }
  }, [open, risk]);

  // Every control here is a fixed choice (or free text with no rule), so there is nothing to
  // check on the field; any rejection is form-level and sits in the banner at the top.
  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/risks/${risk.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        ownerId: ownerId === "none" ? null : ownerId,
        mitigation: mitigation || null,
        probability: Number(probability),
        impact: Number(impact),
      }),
    });
    setLoading(false);

    if (!res.ok) {
      setError(readApiError(await res.json().catch(() => null), "Could not update the risk.").message);
      return;
    }

    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Risk</DialogTitle>
          <DialogDescription>{risk.title}. Changes are audited.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="flex flex-col gap-4" noValidate>
          {error && <Banner tone="bad">{error}</Banner>}
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Status</span>
              <Select value={status} onValueChange={(v) => setStatus(v ?? status)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
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
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Probability</span>
              <Select value={probability} onValueChange={(v) => setProbability(v ?? probability)}>
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
              <span className="text-sm font-medium text-ink-2">Impact</span>
              <Select value={impact} onValueChange={(v) => setImpact(v ?? impact)}>
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
            <label htmlFor="edit-risk-mitigation" className="text-sm font-medium text-ink-2">
              Mitigation
            </label>
            <Input id="edit-risk-mitigation" value={mitigation} onChange={(e) => setMitigation(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
