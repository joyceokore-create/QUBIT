"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Checklist, Choice, Drawer, DrawerFooter, DrawerFrame, DrawerHeader, DrawerSection, DrawerText, Field, FIELD_TEXTAREA, Kv } from "@/components/ui/drawer";
import { Banner } from "@/components/ui/panel";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { readApiError } from "@/lib/form-errors";
import { GateOverrideFormSchema } from "@/lib/workspace-schema";
import { Chip } from "@/components/ui/status-pill";
import { GateReviewBody, type GateTarget } from "@/components/gates/gate-review";
import { CHECKPOINT_STATE_LABEL } from "@/lib/checkpoint-view";
import { approvalChip, type ApproverScope } from "@/lib/gate-approval";
import { formatDayMonth } from "@/lib/dates";
import { PRIMARY, SECONDARY } from "@/lib/surface";
import type { CheckpointRow, CheckpointState } from "@/server/checkpoints";
import { GateSquare } from "@/components/workspace/gates-by-market";

/**
 * Tier 3 — one gate in one market, opened from the Delivery tab's "Gates by Market" grid
 * (design spec v2 drawer). Reads the market's track from the existing checkpoints route and
 * writes through its PATCH, which enforces project:stage / project ownership, the Head of QA
 * testing-gate rule and the gate checklist, and audits every change. Same rules as the
 * Product Track editor: a gate whose checklist is unmet asks for a reason; a later gate set
 * Done closes the earlier ones still open (run on the server: `cascade: true`).
 *
 * WS1 (Tier 4) — a sign-off gate (Go-Live, SIT exit, UAT exit): the PM sees "Submit for
 * Sign-Off" instead of Done and the sign-off state (Submitted / Returned with its reason /
 * Approved); an approver for the gate gets "Review Sign-Off", which opens the review (drawer
 * 13 / 14) inside this drawer with Back. An approver may also set Done directly — recorded as
 * their approval.
 */

export interface OpenGate {
  /** null = the product's own track. */
  orgUnitId: string | null;
  label: string;
  checkpointId: string;
  gateName: string;
  updated: string | null;
}

type Row = Omit<CheckpointRow, "source"> & { source: { label: string; at: string; byName: string | null } | null };
interface Payload {
  rows: Row[];
  canGovern: boolean;
  testingOnly?: boolean;
  approver?: ApproverScope;
  viewerId?: string;
  runsProject?: boolean;
}

// Blocked needs a linked blocker, which is raised from the Register; it is shown, not chosen.
const CHOICES: CheckpointState[] = ["NotStarted", "InProgress", "Done"];

export function GateDrawer({ projectId, gate, onClose, onSaved }: { projectId: string; gate: OpenGate | null; onClose: () => void; onSaved: () => void }) {
  const [review, setReview] = useState<GateTarget | null>(null);
  const close = () => {
    setReview(null);
    onClose();
  };
  return (
    <Drawer open={!!gate} onClose={close} wide={!!review}>
      {gate &&
        (review ? (
          <GateReviewBody
            key={review.statusId}
            target={review}
            onBack={() => setReview(null)}
            onClose={close}
            onDone={onSaved}
          />
        ) : (
          <GateBody key={`${gate.orgUnitId ?? "product"}:${gate.checkpointId}`} projectId={projectId} gate={gate} onClose={close} onSaved={onSaved} onReview={(statusId) => setReview({ projectId, statusId })} />
        ))}
    </Drawer>
  );
}

function GateBody({ projectId, gate, onClose, onSaved, onReview }: { projectId: string; gate: OpenGate; onClose: () => void; onSaved: () => void; onReview: (statusId: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [state, setState] = useState<CheckpointState | null>(null);
  const [unmet, setUnmet] = useState<{ key: string; label: string; detail: string | null }[] | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scopeQuery = gate.orgUnitId ? `?orgUnitId=${encodeURIComponent(gate.orgUnitId)}` : "";
  const scopeBody = { orgUnitId: gate.orgUnitId, moduleId: null, allMarkets: !gate.orgUnitId };

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${projectId}/checkpoints${scopeQuery}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Payload) => {
        if (!alive) return;
        setData(d);
        setState(d.rows.find((r) => r.checkpointId === gate.checkpointId)?.state ?? "NotStarted");
      })
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, [projectId, scopeQuery, gate.checkpointId]);

  const row = data?.rows.find((r) => r.checkpointId === gate.checkpointId) ?? null;
  const canEdit = Boolean(data?.canGovern && row && (!data.testingOnly || row.testing));
  const changed = row !== null && state !== null && state !== row.state;
  const needsReason = unmet !== null;
  // docs/08 § Errors: the early-close reason shows its problem on the field; Close Gate stays enabled.
  const fe = useFieldErrors({ schema: GateOverrideFormSchema, values: { overrideReason: reason }, idPrefix: "gate" });

  // WS1 — the viewer's part in this gate's sign-off.
  const signOff = Boolean(row?.signOff);
  const iApprove = Boolean(row && (data?.approver === "all" || (data?.approver === "testing" && row.testing)));
  const iSubmitted = Boolean(row?.submitted?.byId && row.submitted.byId === data?.viewerId);
  const waiting = row?.approval === "submitted";
  // An approver sets Done directly (implicit approval) — unless they submitted it (four-eyes).
  const doneByHand = !signOff || (iApprove && !(waiting && iSubmitted));
  const canSubmit = Boolean(signOff && row && row.state !== "Done" && !waiting && !doneByHand && data?.runsProject);
  const canReview = Boolean(signOff && waiting && iApprove && !iSubmitted && row?.statusId);

  const patch = (body: Record<string, unknown>) =>
    fetch(`/api/projects/${projectId}/checkpoints`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, ...scopeBody }) });

  const save = async () => {
    if (!row || !state || !changed) return;
    setError(null);
    if (needsReason && !fe.validate()) return;
    setBusy("save");
    // A later gate done closes the earlier ones still open — on the server, which stops at a
    // sign-off gate (submitted instead) and leaves a gate whose checklist refuses as it was.
    const res = await patch({ checkpointId: row.checkpointId, state, ...(state === "Done" ? { cascade: true } : {}), ...(needsReason ? { overrideReason: reason.trim() } : {}) });
    if (res.status === 409) {
      const err = (await res.json().catch(() => null))?.error;
      setUnmet(err?.unmet ?? []);
      setBusy(null);
      return;
    }
    if (!res.ok) {
      const { message, fields } = readApiError(await res.json().catch(() => null), "Could not save the gate. Try again.");
      if (fields.overrideReason) fe.setServerErrors({ overrideReason: fields.overrideReason });
      else setError(message);
      setBusy(null);
      return;
    }
    if (state === "Done" && signOff) toast.success(`${row.name} signed off.`);
    setBusy(null);
    onSaved();
    onClose();
  };

  // Submitting = asking for Done on a sign-off gate: the engine records a submission for this
  // track (and, at "All", every live market's copy), with one notice to the approvers.
  const submit = async () => {
    if (!row) return;
    setBusy("submit");
    setError(null);
    const res = await patch({ checkpointId: row.checkpointId, state: "Done" });
    setBusy(null);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not submit the gate. Try again.");
      return;
    }
    toast.success(`${row.name} submitted for sign-off.`);
    onSaved();
    onClose();
  };

  const stateWord = (s: CheckpointState) => CHECKPOINT_STATE_LABEL[s] ?? s;
  // Provenance is cleared by the next human change, so a gate without it was set by hand.
  const source = row?.source ? `Upload · ${row.source.label}${row.source.byName ? ` · ${row.source.byName}` : ""}` : row && row.state !== "NotStarted" ? "Set by hand" : "Not set yet";
  const choices = [...CHOICES.filter((s) => s !== "Done" || doneByHand || row?.state === "Done"), ...(row?.state === "Blocked" ? (["Blocked"] as CheckpointState[]) : [])];

  const signOffValue = (() => {
    if (!row || !signOff) return null;
    const chip = approvalChip(row.approval);
    const who =
      row.approval === "submitted"
        ? [row.submitted?.byName && `by ${row.submitted.byName}`, row.submitted?.at && formatDayMonth(row.submitted.at, "UTC"), row.source && "from upload"].filter(Boolean).join(" · ")
        : row.decided
          ? [row.decided.byName && `by ${row.decided.byName}`, row.decided.at && formatDayMonth(row.decided.at, "UTC")].filter(Boolean).join(" · ")
          : row.state === "Done"
            ? ""
            : "Needs a Head's sign-off to close";
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {row.approval === "none" && row.state === "Done" ? <Chip tone="ok">Done</Chip> : <Chip tone={chip.tone}>{chip.label}</Chip>}
        {who && <span className="text-[12px] font-normal text-[var(--ds-ink3)]">{who}</span>}
      </span>
    );
  })();

  return (
    <DrawerFrame
      header={<DrawerHeader step={`Gate · ${gate.gateName}`} title={gate.label} subtitle={gate.orgUnitId ? "This market's own gate" : "The product's own gate"} />}
      footer={
        canEdit || canReview ? (
          <DrawerFooter note={changed && row ? `${stateWord(row.state)} → ${stateWord(state!)}` : undefined}>
            <button type="button" onClick={onClose} className={SECONDARY}>
              Cancel
            </button>
            {canEdit && (changed || !(canSubmit || canReview)) && (
              <button type="button" onClick={() => void save()} disabled={!!busy || !changed} className={canSubmit || canReview ? SECONDARY : PRIMARY}>
                {busy === "save" ? "Saving…" : needsReason ? "Close Gate with Reason" : "Save Gate"}
              </button>
            )}
            {canSubmit && canEdit && (
              <button type="button" onClick={() => void submit()} disabled={!!busy} className={PRIMARY}>
                {busy === "submit" ? "Submitting…" : row?.approval === "returned" ? "Submit Again" : "Submit for Sign-Off"}
              </button>
            )}
            {canReview && row?.statusId && (
              <button type="button" onClick={() => onReview(row.statusId!)} disabled={!!busy} className={PRIMARY}>
                Review Sign-Off
              </button>
            )}
          </DrawerFooter>
        ) : (
          <DrawerFooter>
            <button type="button" onClick={onClose} className={SECONDARY}>
              Close
            </button>
          </DrawerFooter>
        )
      }
    >
      {loadError ? (
        <Banner tone="bad">Could not load this gate. Close the drawer and try again.</Banner>
      ) : !data || !row || !state ? (
        <p className="flex items-center gap-2 text-[12.5px] text-[var(--ds-ink3)]">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading the gate…
        </p>
      ) : (
        <>
          {error && <Banner tone="bad">{error}</Banner>}
          <Kv
            rows={[
              [gate.orgUnitId ? "Market" : "Track", gate.label],
              ["Gate", gate.gateName],
              [
                "Now",
                <span key="now" className="inline-flex items-center gap-2">
                  <GateSquare state={row.state} signOff={row.approval === "submitted" || row.approval === "returned" ? row.approval : null} />
                  {stateWord(row.state)}
                </span>,
              ],
              ["Source", source],
              ...(signOffValue ? ([["Sign-Off", signOffValue]] as [string, ReactNode][]) : []),
            ]}
          />
          {row.approval === "returned" && row.decided?.note && (
            <Banner tone="warn">
              Returned{row.decided.byName ? ` by ${row.decided.byName}` : ""}: {row.decided.note}
            </Banner>
          )}
          {row.approval === "submitted" && row.source && <DrawerText hint>Submitted from upload: {row.source.label}.</DrawerText>}
          <DrawerSection title="State">
            {canEdit ? (
              <Choice
                label={`${gate.gateName} state in ${gate.label}`}
                value={state}
                options={choices.map((s) => ({ value: s, label: stateWord(s) }))}
                onChange={(s) => {
                  setState(s);
                  setUnmet(null);
                  setReason("");
                  fe.reset();
                }}
              />
            ) : (
              <DrawerText hint>
                {data.testingOnly && !row.testing ? "As Head of QA you can set testing gates (SIT and UAT). The project's PM sets this one." : "Only the project's PM or a Head can change gates."}
              </DrawerText>
            )}
            {canEdit && signOff && !doneByHand && row.state !== "Done" && (
              <DrawerText hint>
                {waiting
                  ? `This gate is waiting for sign-off by a Head${row.testing ? " or the Head of QA" : ""}. It closes when they approve it.`
                  : `${gate.gateName} needs a sign-off to close: submit it, and a Head${row.testing ? " or the Head of QA" : ""} approves or returns it.`}
              </DrawerText>
            )}
            {canEdit && state === "Done" && changed && signOff && doneByHand && <DrawerText hint>Setting it to done signs it off, recorded as your approval. It also closes the earlier gates still open in this market.</DrawerText>}
            {canEdit && state === "Done" && changed && !signOff && <DrawerText hint>Setting a gate to done also closes the earlier gates still open in this market, up to the first gate that needs a sign-off.</DrawerText>}
          </DrawerSection>
          {row.gate.length > 0 && (
            <DrawerSection title="What This Gate Asks For">
              <Checklist items={row.gate.map((r) => ({ label: r.detail && !r.met ? `${r.label} (${r.detail})` : r.label, done: r.met }))} />
            </DrawerSection>
          )}
          {row.overrideReason && <Banner tone="warn">Closed early: {row.overrideReason}</Banner>}
          {unmet && (
            <>
              <Banner tone="warn">
                This gate is not satisfied yet{unmet.length ? `: ${unmet.map((u) => u.label).join("; ")}` : ""}. You can close it anyway with a reason; the reason is recorded.
              </Banner>
              <Field label="Why Close It Anyway" htmlFor={fe.idOf("overrideReason")} error={fe.errors.overrideReason} hint="At least 5 characters. The Head sees this.">
                <textarea {...fe.bind("overrideReason")} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="For example: the client signed off by email" className={FIELD_TEXTAREA} />
              </Field>
            </>
          )}
          {gate.orgUnitId && canEdit && <DrawerText hint>This changes {gate.label} only. To change every market at once, use the Product Track below the grid.</DrawerText>}
        </>
      )}
    </DrawerFrame>
  );
}
