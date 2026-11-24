"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Checklist, Drawer, DrawerFooter, DrawerFrame, DrawerHeader, DrawerSection, DrawerText, Field, FIELD_TEXTAREA, Kv } from "@/components/ui/drawer";
import { Banner } from "@/components/ui/panel";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { readApiError } from "@/lib/form-errors";
import { reasonField } from "@/lib/reason-schema";
import { z } from "zod";
import { Chip, HealthPill } from "@/components/ui/status-pill";
import { ageDays, ageLabel, APPROVALS_CHANGED } from "@/lib/approvals";
import { approvalChip, DECISION_NOTE_MAX, DECISION_NOTE_MIN } from "@/lib/gate-approval";
import { FOCUS, PRIMARY, SECONDARY } from "@/lib/surface";
import { cn } from "@/lib/utils";
import type { GateReview } from "@/server/gate-approval";

/**
 * WS1 (Tier 4) — the gate sign-off review, design spec v2 drawers 13 "Approve a Stage Gate"
 * (wide: checklist, evidence, note; Return to PM / Approve Gate) and 14 "Sign Off a Testing
 * Gate" (pass rate "Not tracked", open critical issues, evidence; Return to PM / Sign Off
 * with Exception). One body, two shapes by gate kind. Reads GET
 * /api/projects/:id/checkpoints/:statusId and posts to its approve / return routes; the
 * engine enforces approver scope, four-eyes and the exception rule, and audits each decision.
 * A viewer who may not decide (the PM on their own submission) sees it read-only.
 */

export interface GateTarget {
  projectId: string;
  statusId: string;
}

const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};
const ago = (iso: string | null, tz: string) => {
  if (!iso) return null;
  const d = ageDays(iso, new Date(), tz);
  return d === 0 ? "today" : `${ageLabel(d)} ago`;
};

/** A wide drawer holding the review — for lists (Approvals, Head and Quality homes). */
export function GateReviewDrawer({ target, onClose, onDone, timeZone }: { target: GateTarget | null; onClose: () => void; onDone?: () => void; timeZone?: string }) {
  return (
    <Drawer open={!!target} onClose={onClose} wide>
      {target && <GateReviewBody key={target.statusId} target={target} onClose={onClose} onDone={onDone} timeZone={timeZone} />}
    </Drawer>
  );
}

type Decision = "approve" | "approve_exception" | "return";

const NOTE_SCHEMA = z.object({ note: z.string().trim().max(DECISION_NOTE_MAX, `The note must be ${DECISION_NOTE_MAX} characters or fewer.`) });
/** Return / Sign Off with Exception: the note becomes a required reason (same rule as the server's
 * NOTE_REQUIRED in src/lib/gate-approval.ts). */
const REQUIRED_NOTE_SCHEMA = z.object({ note: reasonField(DECISION_NOTE_MIN, DECISION_NOTE_MAX) });

export function GateReviewBody({ target, onClose, onDone, onBack, timeZone }: { target: GateTarget; onClose: () => void; onDone?: () => void; onBack?: () => void; timeZone?: string }) {
  const tz = timeZone ?? browserTz();
  const [data, setData] = useState<GateReview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  // docs/08 § Errors: the Decision Note shows its problem on the field. Whether it is required
  // depends on which button is pressed (Return / Sign Off with Exception): `decide` validates with
  // that action's schema, which then also drives the live re-check while the person types.
  const fe = useFieldErrors({ schema: NOTE_SCHEMA, values: { note }, idPrefix: "gate-note" });

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${target.projectId}/checkpoints/${target.statusId}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(((await r.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "Could not load this gate."))))
      .then((d: GateReview) => alive && setData(d))
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [target.projectId, target.statusId]);

  const decide = async (kind: Decision) => {
    if (!data) return;
    const trimmed = note.trim();
    setError(null);
    const needsReason = kind === "return" || kind === "approve_exception";
    if (!fe.validate(undefined, { schema: needsReason ? REQUIRED_NOTE_SCHEMA : NOTE_SCHEMA })) return;
    setBusy(kind);
    const url = `/api/projects/${target.projectId}/checkpoints/${target.statusId}/${kind === "return" ? "return" : "approve"}`;
    const body = kind === "return" ? { note: trimmed } : { exception: kind === "approve_exception", ...(trimmed ? { note: trimmed } : {}) };
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const { message, fields } = readApiError(res ? await res.json().catch(() => null) : null, "Could not record the decision. Try again.");
      if (fields.note) fe.setServerErrors({ note: fields.note });
      else setError(message);
      return;
    }
    const it = data.item;
    toast.success(kind === "return" ? `${it.gateName} returned to the PM.` : `${it.gateName} on ${it.projectName} signed off.`);
    window.dispatchEvent(new Event(APPROVALS_CHANGED));
    onDone?.();
    onClose();
  };

  if (loadError || !data) {
    return (
      <DrawerFrame header={<DrawerHeader step="Gate sign-off" title="Gate" onBack={onBack} />}>
        {loadError ? (
          <Banner tone="bad">{loadError}</Banner>
        ) : (
          <p className="flex items-center gap-2 text-[12.5px] text-[var(--ds-ink3)]">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading the gate…
          </p>
        )}
      </DrawerFrame>
    );
  }

  const it = data.item;
  const testing = it.testing;
  const critical = data.critical?.total ?? 0;
  const met = data.checklist.filter((r) => r.met).length;
  const where = it.marketName ?? it.moduleName ?? "Product";
  const submitted = [it.submittedByName ? `Submitted by ${it.submittedByName}` : "Submitted", ago(it.submittedAt, tz), it.source ? "from an upload" : null].filter(Boolean).join(" · ");
  const subtitle = it.approval === "submitted" ? submitted : it.decidedAt ? `${approvalChip(it.approval).label} by ${it.decidedByName ?? "an approver"} · ${ago(it.decidedAt, tz)}` : submitted;
  const decide_ = it.canDecide;
  const exceptionOnly = data.exceptionAllowed;

  const footer = decide_ ? (
    testing ? (
      <DrawerFooter>
        {exceptionOnly ? (
          <>
            <button type="button" disabled={!!busy} onClick={() => void decide("approve_exception")} className={SECONDARY}>
              {busy === "approve_exception" ? "Signing Off…" : "Sign Off with Exception"}
            </button>
            <button type="button" disabled={!!busy} onClick={() => void decide("return")} className={PRIMARY}>
              {busy === "return" ? "Returning…" : "Return to PM"}
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={!!busy} onClick={() => void decide("return")} className={SECONDARY}>
              {busy === "return" ? "Returning…" : "Return to PM"}
            </button>
            <button type="button" disabled={!!busy} onClick={() => void decide("approve")} className={PRIMARY}>
              {busy === "approve" ? "Signing Off…" : "Sign Off"}
            </button>
          </>
        )}
      </DrawerFooter>
    ) : (
      <DrawerFooter>
        <button type="button" disabled={!!busy} onClick={() => void decide("return")} className={SECONDARY}>
          {busy === "return" ? "Returning…" : "Return to PM"}
        </button>
        <button type="button" disabled={!!busy} onClick={() => void decide(exceptionOnly ? "approve_exception" : "approve")} className={PRIMARY}>
          {busy && busy !== "return" ? "Approving…" : exceptionOnly ? "Approve with Exception" : "Approve Gate"}
        </button>
      </DrawerFooter>
    )
  ) : (
    <DrawerFooter>
      <button type="button" onClick={onClose} className={SECONDARY}>
        Close
      </button>
    </DrawerFooter>
  );

  const status = approvalChip(it.approval, it.submittedAt ? ageDays(it.submittedAt, new Date(), tz) : undefined);

  return (
    <DrawerFrame
      header={
        <DrawerHeader
          onBack={onBack}
          step={testing ? `Testing gate · ${it.gateName}` : `Stage gate ${data.stageIndex} of ${data.stageCount} · ${it.gateName}`}
          title={it.projectName}
          subtitle={subtitle}
        />
      }
      footer={footer}
    >
      {error && <Banner tone="bad">{error}</Banner>}
      {testing ? (
        <Kv
          rows={[
            ["Test Cases Passed", "Not tracked"],
            ["Critical Issues Open", critical ? <Chip tone="bad">{critical}</Chip> : <Chip tone="ok">None</Chip>],
            ["Requirement Coverage", data.coveragePct !== null ? `${data.coveragePct}%` : "Not tracked"],
            [it.marketName ? "Market" : "Track", where],
            ["Sign-Off", <Chip key="s" tone={status.tone}>{status.label}</Chip>],
            ["Last Change", it.source ? `Status upload · ${it.source}` : "Set by hand"],
          ]}
        />
      ) : (
        <Kv
          rows={[
            ["Project Status", <HealthPill key="h" value={data.reported} />],
            ["Progress", data.progress !== null ? `${data.progress}%` : "Not tracked"],
            ["Checklist", data.checklist.length ? `${met} of ${data.checklist.length} done` : "No checklist"],
            [it.marketName ? "Market" : "Track", where],
            ["Last Change", it.source ? `Status upload · ${it.source}` : "Set by hand"],
            ["Earlier Gates", data.earlierTotal ? `${data.earlierDone} of ${data.earlierTotal} done` : "None"],
          ]}
        />
      )}

      {it.approval === "returned" && it.decisionNote && <Banner tone="warn">Returned{it.decidedByName ? ` by ${it.decidedByName}` : ""}: {it.decisionNote}</Banner>}
      {(it.approval === "approved" || it.approval === "approved_with_exception") && it.decisionNote && <Banner tone="info">Decision note: {it.decisionNote}</Banner>}
      {decide_ && testing && critical > 0 && (
        <Banner tone="warn">
          {critical === 1 ? "1 critical issue is" : `${critical} critical issues are`} still open. Signing off now records an exception with your reason.
        </Banner>
      )}
      {decide_ && data.unmet > 0 && !(testing && critical > 0) && (
        <Banner tone="warn">
          {data.unmet === 1 ? "1 checklist item is" : `${data.unmet} checklist items are`} not met. Approving now records an exception with your note.
        </Banner>
      )}
      {!decide_ && it.approval === "submitted" && (
        <Banner tone="info">
          Waiting for a Head{testing ? " or the Head of QA" : ""} to sign it off.{data.viewerSubmitted ? " You submitted it, so someone else signs it off." : ""}
        </Banner>
      )}

      {testing && data.critical && (
        <DrawerSection title="Open Critical Issues">
          {data.critical.items.length === 0 ? (
            <DrawerText hint>No critical issues are open on this project.</DrawerText>
          ) : (
            <ul className="m-0 flex list-disc flex-col gap-[5px] pl-[18px] text-[13px] text-[var(--ds-ink2)]">
              {data.critical.items.map((c) => (
                <li key={`${c.kind}-${c.id}`}>
                  <Link href={c.href} className={cn("rounded-[3px] font-semibold text-[var(--ds-ink)] hover:underline", FOCUS)}>
                    {c.title}
                  </Link>
                  <span className="text-[var(--ds-ink3)]"> · {c.kind === "bug" ? "bug" : "issue"}{c.owner ? ` · ${c.owner}` : " · no owner"}</span>
                </li>
              ))}
              {data.critical.total > data.critical.items.length && <li className="text-[var(--ds-ink3)]">and {data.critical.total - data.critical.items.length} more</li>}
            </ul>
          )}
        </DrawerSection>
      )}

      {data.checklist.length > 0 && (
        <DrawerSection title={testing ? "Exit Checklist" : "Readiness Checklist"}>
          <Checklist items={data.checklist.map((r) => ({ label: r.detail && !r.met ? `${r.label} (${r.detail})` : r.label, done: r.met }))} />
        </DrawerSection>
      )}

      <DrawerSection title="Evidence">
        {data.evidence.length === 0 && !it.source ? (
          <DrawerText hint>No documents in the project&apos;s register yet.</DrawerText>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {it.source && (
              <span className="inline-flex items-center gap-[5px] rounded-[8px] bg-[var(--ds-surface2)] px-2.5 py-[5px] text-[12px] text-[var(--ds-ink2)]">
                <FileText className="size-[13px]" aria-hidden /> {it.source}
              </span>
            )}
            {data.evidence.map((d) => (
              <Link
                key={d.id}
                href={`/projects/${it.projectId}?tab=Documents`}
                title={`${d.kind} · ${d.status}`}
                className={cn("inline-flex items-center gap-[5px] rounded-[8px] bg-[var(--ds-surface2)] px-2.5 py-[5px] text-[12px] text-[var(--ds-ink2)] hover:text-[var(--ds-ink)]", FOCUS)}
              >
                <FileText className="size-[13px]" aria-hidden /> {d.title}
              </Link>
            ))}
          </div>
        )}
      </DrawerSection>

      {decide_ && (
        <Field label="Decision Note" htmlFor={fe.idOf("note")} error={fe.errors.note} hint={exceptionOnly ? "Required to return or to sign off with an exception. At least 5 characters. The PM sees it." : "Required to return it. At least 5 characters. The PM sees it."}>
          <textarea
            {...fe.bind("note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={testing ? "For example: return until the session drop is fixed; the SMS issue can go live as a known issue." : "For example: approve once the branches confirm hardware, by Wednesday 17:00."}
            className={FIELD_TEXTAREA}
          />
        </Field>
      )}
    </DrawerFrame>
  );
}
