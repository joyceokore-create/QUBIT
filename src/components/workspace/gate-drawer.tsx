"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Checklist, Choice, Drawer, DrawerError, DrawerFooter, DrawerFrame, DrawerHeader, DrawerSection, DrawerText, Field, FIELD_TEXTAREA, Kv } from "@/components/ui/drawer";
import { Banner } from "@/components/ui/panel";
import { CHECKPOINT_STATE_LABEL } from "@/lib/checkpoint-view";
import { earlierOpenGates } from "@/lib/gate-grid";
import { PRIMARY, SECONDARY } from "@/lib/surface";
import type { CheckpointRow, CheckpointState } from "@/server/checkpoints";
import { GateSquare } from "@/components/workspace/gates-by-market";

/**
 * Tier 3 — one gate in one market, opened from the Delivery tab's "Gates by Market" grid
 * (design spec v2 drawer). Reads the market's track from the existing checkpoints route and
 * writes through its PATCH, which enforces project:stage / project ownership, the Head of QA
 * testing-gate rule and the gate checklist, and audits every change. Same rules as the
 * Product Track editor: a gate whose checklist is unmet asks for a reason; a later gate set
 * Done closes the earlier ones still open.
 */

export interface OpenGate {
  /** null = the product's own track. */
  orgUnitId: string | null;
  label: string;
  checkpointId: string;
  gateName: string;
  updated: string | null;
}

interface Payload {
  rows: (Omit<CheckpointRow, "source"> & { source: { label: string; at: string; byName: string | null } | null })[];
  canGovern: boolean;
  testingOnly?: boolean;
}

// Blocked needs a linked blocker, which is raised from the Register; it is shown, not chosen.
const CHOICES: CheckpointState[] = ["NotStarted", "InProgress", "Done"];
const REASON_MIN = 5;

export function GateDrawer({ projectId, gate, onClose, onSaved }: { projectId: string; gate: OpenGate | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Drawer open={!!gate} onClose={onClose}>
      {gate && <GateBody key={`${gate.orgUnitId ?? "product"}:${gate.checkpointId}`} projectId={projectId} gate={gate} onClose={onClose} onSaved={onSaved} />}
    </Drawer>
  );
}

function GateBody({ projectId, gate, onClose, onSaved }: { projectId: string; gate: OpenGate; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [state, setState] = useState<CheckpointState | null>(null);
  const [unmet, setUnmet] = useState<{ key: string; label: string; detail: string | null }[] | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
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
  const reasonOk = !needsReason || reason.trim().length >= REASON_MIN;

  const patch = (body: Record<string, unknown>) =>
    fetch(`/api/projects/${projectId}/checkpoints`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, ...scopeBody }) });

  const save = async () => {
    if (!row || !state || !changed || !reasonOk) return;
    setBusy(true);
    setError(null);
    const res = await patch({ checkpointId: row.checkpointId, state, ...(needsReason ? { overrideReason: reason.trim() } : {}) });
    if (res.status === 409) {
      const err = (await res.json().catch(() => null))?.error;
      setUnmet(err?.unmet ?? []);
      setBusy(false);
      return;
    }
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not save the gate. Try again.");
      setBusy(false);
      return;
    }
    // A later gate done closes the earlier ones still open (a gate whose checklist refuses
    // stays as it was, for the PM to decide) — the Product Track editor's rule.
    if (state === "Done") {
      const next = (await res.json().catch(() => null)) as Payload | null;
      for (const id of earlierOpenGates(next?.rows ?? [], row.checkpointId)) {
        await patch({ checkpointId: id, state: "Done" });
      }
    }
    setBusy(false);
    onSaved();
    onClose();
  };

  const stateWord = (s: CheckpointState) => CHECKPOINT_STATE_LABEL[s] ?? s;
  // Provenance is cleared by the next human change, so a gate without it was set by hand.
  const source = row?.source ? `Upload · ${row.source.label}${row.source.byName ? ` · ${row.source.byName}` : ""}` : row && row.state !== "NotStarted" ? "Set by hand" : "Not set yet";

  return (
    <DrawerFrame
      header={<DrawerHeader step={`Gate · ${gate.gateName}`} title={gate.label} subtitle={gate.orgUnitId ? "This market's own gate" : "The product's own gate"} />}
      footer={
        canEdit ? (
          <DrawerFooter note={changed && row ? `${stateWord(row.state)} → ${stateWord(state!)}` : undefined}>
            <button type="button" onClick={onClose} className={SECONDARY}>
              Cancel
            </button>
            <button type="button" onClick={() => void save()} disabled={busy || !changed || !reasonOk} className={PRIMARY}>
              {busy ? "Saving…" : needsReason ? "Close Gate with Reason" : "Save Gate"}
            </button>
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
        <DrawerError>Could not load this gate. Close the drawer and try again.</DrawerError>
      ) : !data || !row || !state ? (
        <p className="flex items-center gap-2 text-[12.5px] text-[var(--ds-ink3)]">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading the gate…
        </p>
      ) : (
        <>
          <Kv
            rows={[
              [gate.orgUnitId ? "Market" : "Track", gate.label],
              ["Gate", gate.gateName],
              [
                "Now",
                <span key="now" className="inline-flex items-center gap-2">
                  <GateSquare state={row.state} size={12} />
                  {stateWord(row.state)}
                </span>,
              ],
              ["Source", source],
            ]}
          />
          <DrawerSection title="State">
            {canEdit ? (
              <Choice
                label={`${gate.gateName} state in ${gate.label}`}
                value={state}
                options={[...CHOICES, ...(row.state === "Blocked" ? (["Blocked"] as CheckpointState[]) : [])].map((s) => ({ value: s, label: stateWord(s) }))}
                onChange={(s) => {
                  setState(s);
                  setUnmet(null);
                  setReason("");
                }}
              />
            ) : (
              <DrawerText hint>
                {data.testingOnly && !row.testing ? "As Head of QA you can set testing gates (SIT and UAT). The project's PM sets this one." : "Only the project's PM or a Head can change gates."}
              </DrawerText>
            )}
            {canEdit && state === "Done" && <DrawerText hint>Setting a gate to done also closes the earlier gates still open in this market.</DrawerText>}
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
              <Field label="Why Close It Anyway" hint={`At least ${REASON_MIN} characters. The Head sees this.`}>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} placeholder="For example: the client signed off by email" className={FIELD_TEXTAREA} />
              </Field>
            </>
          )}
          {gate.orgUnitId && canEdit && <DrawerText hint>This changes {gate.label} only. To change every market at once, use the Product Track below the grid.</DrawerText>}
          {error && <DrawerError>{error}</DrawerError>}
        </>
      )}
    </DrawerFrame>
  );
}
