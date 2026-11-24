"use client";

import { Foot, Panel } from "@/components/ui/panel";
import { TextButton } from "@/components/ui/text-link";
import { CHECKPOINT_STATE_LABEL } from "@/lib/checkpoint-view";
import { FOCUS, THEAD, TROW } from "@/lib/surface";
import type { CheckpointState } from "@/lib/checkpoint-progress";
import type { GateGrid } from "@/lib/gate-grid";
import type { OpenGate } from "@/components/workspace/gate-drawer";

/**
 * Tier 3 — the Delivery tab's "Gates by Market" (design `.sgt` table of `.gc` squares): one
 * row per market, one column per gate on the project's template, and where the row's latest
 * change came from. Every square opens that gate in that market (GateDrawer).
 */

// Design `.gc`: 16px squares, radius 5 — done green, in progress amber, blocked red, not
// started muted with a line ring. Each square also carries its word (never colour alone).
const FILL: Record<CheckpointState, string> = {
  Done: "var(--ds-ok)",
  InProgress: "var(--ds-warn)",
  Blocked: "var(--ds-bad)",
  NotStarted: "var(--ds-mutedw)",
};
const LEGEND: CheckpointState[] = ["Done", "InProgress", "Blocked", "NotStarted"];

/** WS1 — a gate waiting for sign-off reads as the design's "Waiting for approval" (amber
 * square with an ink ring, so it differs from plain in-progress by more than colour); a
 * returned one carries a red ring. */
export type SignOffMark = "submitted" | "returned" | null;
const RING: Record<"submitted" | "returned", string> = { submitted: "0 0 0 2px var(--ds-card), 0 0 0 3.5px var(--ds-ink2)", returned: "0 0 0 2px var(--ds-card), 0 0 0 3.5px var(--ds-bad)" };

export function GateSquare({ state, size = 16, signOff = null }: { state: CheckpointState; size?: number; signOff?: SignOffMark }) {
  return (
    <span
      aria-hidden
      className="inline-block flex-none align-middle"
      style={{
        width: size,
        height: size,
        borderRadius: size > 12 ? 5 : 3,
        background: signOff === "submitted" ? "var(--ds-warn)" : FILL[state],
        boxShadow: signOff ? RING[signOff] : state === "NotStarted" ? "inset 0 0 0 1px var(--ds-line)" : undefined,
      }}
    />
  );
}
const SIGN_OFF_WORD: Record<"submitted" | "returned", string> = { submitted: "waiting for sign-off", returned: "returned by the approver" };

export function GatesByMarket({
  grid,
  market,
  onOpen,
  onManage,
}: {
  grid: GateGrid;
  /** The header's market filter; null = every market. */
  market: string | null;
  onOpen: (gate: OpenGate) => void;
  /** Governors: opens the markets panel. */
  onManage?: () => void;
}) {
  const rows = market ? grid.rows.filter((r) => r.orgUnitId === market) : grid.rows;
  const title = grid.rows.some((r) => r.orgUnitId) ? "Gates by Market" : "Gates";

  return (
    <Panel title={title} labelledBy="ws-gates" action={onManage ? <TextButton onClick={onManage}>Manage Markets</TextButton> : undefined}>
      {grid.gates.length === 0 ? (
        <p className="text-[12.5px] text-[var(--ds-ink3)]">No gate template on this project yet. Pick one in the Product Track below.</p>
      ) : (
        <>
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-[12.5px]">
              <caption className="sr-only">Gate states per market. Each square opens that gate.</caption>
              <thead className={THEAD}>
                <tr>
                  <th scope="col">{title === "Gates" ? "Track" : "Market"}</th>
                  {grid.gates.map((g) => (
                    <th key={g.checkpointId} scope="col" className="!text-center">
                      {g.name}
                    </th>
                  ))}
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.orgUnitId ?? "product"} className={TROW}>
                    <td className="whitespace-nowrap">
                      <b className="font-semibold text-[var(--ds-ink)]">
                        {r.flag ? `${r.flag} ` : ""}
                        {r.label}
                      </b>
                    </td>
                    {grid.gates.map((g, i) => {
                      const st = r.states[i] ?? "NotStarted";
                      const mark = r.signOff?.[i] ?? null;
                      const word = `${CHECKPOINT_STATE_LABEL[st] ?? st}${mark ? `, ${SIGN_OFF_WORD[mark]}` : ""}`;
                      return (
                        <td key={g.checkpointId} className="text-center">
                          <button
                            type="button"
                            data-gate-cell
                            title={`${g.name}: ${word}`}
                            aria-label={`${r.label}, ${g.name}: ${word}. Update this gate`}
                            onClick={() => onOpen({ orgUnitId: r.orgUnitId, label: r.label, checkpointId: g.checkpointId, gateName: g.name, updated: r.updated })}
                            className={`inline-grid size-7 place-items-center rounded-[6px] transition-colors hover:bg-[var(--ds-surface2)] ${FOCUS}`}
                          >
                            <GateSquare state={st} signOff={mark} />
                          </button>
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap text-[12px] text-[var(--ds-ink3)]">{r.updated ?? "Not set yet"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Foot action={<span>Click a gate to update it.</span>}>
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              {LEGEND.map((st) => (
                <span key={st} className="inline-flex items-center gap-1.5">
                  <GateSquare state={st} size={11} />
                  {CHECKPOINT_STATE_LABEL[st]}
                </span>
              ))}
              {rows.some((r) => r.signOff?.some(Boolean)) && (
                <span className="inline-flex items-center gap-1.5">
                  <GateSquare state="InProgress" size={11} signOff="submitted" />
                  Waiting for sign-off
                </span>
              )}
            </span>
          </Foot>
        </>
      )}
    </Panel>
  );
}
