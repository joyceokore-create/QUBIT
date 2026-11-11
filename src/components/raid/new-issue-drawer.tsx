"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Drawer, DrawerError, DrawerFooter, DrawerFrame, DrawerHeader, Field, FIELD_INPUT } from "@/components/ui/drawer";
import { SEVERITY_ORDER } from "@/components/raid/severity";
import { PRIMARY, SECONDARY } from "@/lib/surface";

/**
 * UX fidelity Tier 2 — "+ New Issue" (design: Head of QA › Risks & Issues). Raises an issue
 * directly (POST /api/issues); edits open in the right-hand drawer, per the design.
 */
export function NewIssueButton({ projects, users }: { projects: { id: string; code: string; name: string }[]; users: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [severity, setSeverity] = useState<string>("High");
  const [ownerId, setOwnerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3) return setError("Give the issue a title of at least 3 characters.");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/issues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim(), projectId: projectId || null, severity, ownerId: ownerId || null }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      return setError(body?.error?.message ?? "Couldn't raise the issue. Try again.");
    }
    toast.success("Issue raised.");
    setOpen(false);
    setTitle("");
    setOwnerId("");
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={PRIMARY}>
        <Plus className="size-3.5" aria-hidden /> New Issue
      </button>
      <Drawer open={open} onClose={() => setOpen(false)}>
        <DrawerFrame
          onSubmit={submit}
          header={<DrawerHeader step="New Issue" title="Raise an Issue" subtitle="Something that is already going wrong. Risks are things that might." />}
          footer={
            <DrawerFooter note="Audited.">
              <button type="button" onClick={() => setOpen(false)} className={SECONDARY}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={PRIMARY}>
                {busy ? "Raising…" : "Raise Issue"}
              </button>
            </DrawerFooter>
          }
        >
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder="For example: duplicate SMS on sign-up" className={FIELD_INPUT} />
          </Field>
          <Field label="Project">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={FIELD_INPUT}>
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Severity">
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={FIELD_INPUT}>
              {SEVERITY_ORDER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Owner (optional)" hint="Leave empty to show it as Unassigned.">
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={FIELD_INPUT}>
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          {error && <DrawerError>{error}</DrawerError>}
        </DrawerFrame>
      </Drawer>
    </>
  );
}
