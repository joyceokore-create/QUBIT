"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCUS, PRIMARY, QUIET, SECONDARY } from "@/lib/surface";

/**
 * Milestone D — the Head edits the roll-up distribution list: current rows (remove ×),
 * a person from the executive seats, or an address typed in. The server owns validation
 * and the audit row; this re-fetches after every change so the chips can't drift.
 */

export interface RecipientJson {
  id: string;
  email: string;
  name: string | null;
  userId: string | null;
}

interface Candidate {
  userId: string;
  name: string;
  email: string;
  roles: string[];
}

const INPUT = `h-9 rounded-[8px] border border-[var(--input)] bg-background px-3 text-[13px] text-foreground focus:border-brand ${FOCUS}`;

export function RecipientsDialog({ open, onOpenChange, onChange }: { open: boolean; onOpenChange: (o: boolean) => void; onChange: (rows: RecipientJson[]) => void }) {
  const [rows, setRows] = useState<RecipientJson[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pick, setPick] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/rollup/recipients");
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error?.message ?? "Could not load the list.");
      return;
    }
    setRows(body.data.recipients);
    setCandidates(body.data.candidates);
    onChange(body.data.recipients);
  };

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const add = async (payload: { userId?: string; email?: string }) => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/rollup/recipients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(body?.error?.message ?? "Could not add that recipient.");
      return;
    }
    setPick("");
    setEmail("");
    await load();
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/rollup/recipients?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError("Could not remove that recipient.");
      return;
    }
    await load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Roll-up recipients</DialogTitle>
          <DialogDescription>Who gets the weekly roll-up when you press Email to executives. The PDF is internal and confidential.</DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col" aria-label="Current recipients">
          {rows.length === 0 && <li className="py-2 text-[12.5px] italic text-[var(--ink5)]">Nobody yet — add the executives below.</li>}
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 border-t border-[var(--hair2)] py-2 text-[13px] first:border-0">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold text-[var(--qink)]">{r.name ?? r.email}</span>
                {r.name && <span className="text-[var(--ink4)]"> · {r.email}</span>}
              </span>
              <button type="button" onClick={() => void remove(r.id)} disabled={busy} aria-label={`Remove ${r.name ?? r.email}`} className={`${QUIET} px-1`}>
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (pick) void add({ userId: pick });
          }}
        >
          <label htmlFor="recipient-user" className="text-[11.5px] font-semibold text-[var(--ink4)]">
            Add a person
          </label>
          <div className="flex gap-2">
            <select id="recipient-user" value={pick} onChange={(e) => setPick(e.target.value)} className={`${INPUT} min-w-0 flex-1`}>
              <option value="">{candidates.length ? "Choose from the executive seats…" : "Everyone eligible is already listed"}</option>
              {candidates.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.name} · {c.roles.join(", ")}
                </option>
              ))}
            </select>
            <button type="submit" disabled={!pick || busy} className={SECONDARY}>
              Add
            </button>
          </div>
        </form>

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) void add({ email: email.trim() });
          }}
        >
          <label htmlFor="recipient-email" className="text-[11.5px] font-semibold text-[var(--ink4)]">
            Add an email address
          </label>
          <div className="flex gap-2">
            <input id="recipient-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.example" className={`${INPUT} min-w-0 flex-1`} />
            <button type="submit" disabled={!email.trim() || busy} className={PRIMARY}>
              Add
            </button>
          </div>
        </form>

        {error && (
          <p role="alert" className="text-[12px] text-[var(--bad)]">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
