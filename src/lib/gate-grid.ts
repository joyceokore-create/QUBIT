import { dayKey, formatDayMonth } from "@/lib/dates";
import { isoWeekId } from "@/lib/iso-week";
import type { CheckpointState } from "@/lib/checkpoint-progress";

/**
 * The project workspace's "Gates by Market" grid (design spec v2, Tier 3): one row per market
 * the product ships to, one column per gate on the project's checkpoint template, plus where
 * the row's latest change came from ("Upload · Mon", "Edited · Thu"). Pure and client-safe;
 * the page shapes the rows on the server from rows it already reads under RLS.
 */

export interface GridGate {
  checkpointId: string;
  name: string;
}

export interface GridStatus {
  /** null = the product's own track. */
  orgUnitId: string | null;
  checkpointId: string;
  state: string;
  /** Set when a status-report upload moved it; cleared by the next human change. */
  source: string | null;
  updatedAt: Date;
}

export interface GridMarket {
  orgUnitId: string;
  name: string;
  flag: string | null;
}

export interface GateGridRow {
  /** null = the product's own track (shown only when the project ships to no market). */
  orgUnitId: string | null;
  label: string;
  flag: string | null;
  states: CheckpointState[];
  /** The gate the row is at (see `currentGateName`), or null without gates. */
  currentGate: string | null;
  done: number;
  /** "Upload · Mon" / "Edited · Thu" / "Edited · last week" / "Edited · 12 Oct"; null when never set. */
  updated: string | null;
}

export interface GateGrid {
  gates: GridGate[];
  rows: GateGridRow[];
  /** The product's own track — the header's stage and the status card's build status. */
  product: GateGridRow;
}

const STATES: readonly CheckpointState[] = ["NotStarted", "InProgress", "Done", "Blocked"];
const asState = (s: string | undefined): CheckpointState => (s && (STATES as readonly string[]).includes(s) ? (s as CheckpointState) : "NotStarted");

/**
 * Where a row stands: the furthest gate that is in progress or blocked; else the first gate
 * not yet done; else (every gate done) the last gate. Null when there are no gates.
 */
export function currentGateName(names: string[], states: CheckpointState[]): string | null {
  if (!names.length) return null;
  for (let i = states.length - 1; i >= 0; i--) {
    if (states[i] === "InProgress" || states[i] === "Blocked") return names[i] ?? null;
  }
  const open = states.findIndex((s) => s !== "Done");
  return open === -1 ? (names[names.length - 1] ?? null) : (names[open] ?? null);
}

/** A tenant-local calendar day ("2026-11-09") as a UTC date, for ISO-week comparison. */
const localDay = (d: Date, tz: string) => new Date(`${dayKey(d, tz)}T00:00:00Z`);

/**
 * Who moved a row last and when, in the tenant's zone: the weekday within this week
 * ("today" for today), "last week" for the week before, else "12 Oct".
 */
export function updatedLabel(at: Date, viaUpload: boolean, now: Date, tz: string): string {
  const who = viaUpload ? "Upload" : "Edited";
  const day = localDay(at, tz);
  const today = localDay(now, tz);
  let when: string;
  if (day.getTime() === today.getTime()) when = "today";
  else if (isoWeekId(day) === isoWeekId(today)) when = day.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  else if (isoWeekId(day) === isoWeekId(new Date(today.getTime() - 7 * 86_400_000))) when = "last week";
  else when = formatDayMonth(at, tz);
  return `${who} · ${when}`;
}

/** Shapes the grid. Markets are rows; with no markets the product's own track is the one row. */
export function buildGateGrid(input: { gates: GridGate[]; statuses: GridStatus[]; markets: GridMarket[]; productLabel: string; now: Date; timeZone: string }): GateGrid {
  const { gates, statuses, markets, now, timeZone } = input;
  const productUnit = { orgUnitId: null, label: input.productLabel, flag: null };
  const gateIds = new Set(gates.map((g) => g.checkpointId));
  const names = gates.map((g) => g.name);
  const rowFor = (u: { orgUnitId: string | null; label: string; flag: string | null }): GateGridRow => {
    const mine = statuses.filter((s) => s.orgUnitId === u.orgUnitId && gateIds.has(s.checkpointId));
    const byGate = new Map(mine.map((s) => [s.checkpointId, s.state]));
    const states = gates.map((g) => asState(byGate.get(g.checkpointId)));
    const latest = mine.reduce<GridStatus | null>((a, s) => (!a || s.updatedAt > a.updatedAt ? s : a), null);
    return {
      orgUnitId: u.orgUnitId,
      label: u.label,
      flag: u.flag,
      states,
      currentGate: currentGateName(names, states),
      done: states.filter((s) => s === "Done").length,
      updated: latest ? updatedLabel(latest.updatedAt, Boolean(latest.source), now, timeZone) : null,
    };
  };
  const product = rowFor(productUnit);
  const rows = markets.length ? markets.map((m) => rowFor({ orgUnitId: m.orgUnitId, label: m.name, flag: m.flag })) : [product];
  return { gates, rows, product };
}

/** Joyce (2026-10-12): a later gate done closes the earlier ones still open — the ids to
 * close after `checkpointId` is set to Done (Blocked and Done rows are left alone). */
export function earlierOpenGates(rows: { checkpointId: string; orderIndex: number; state: string }[], checkpointId: string): string[] {
  const me = rows.find((r) => r.checkpointId === checkpointId);
  if (!me) return [];
  return rows.filter((r) => r.orderIndex < me.orderIndex && r.state !== "Done" && r.state !== "Blocked").map((r) => r.checkpointId);
}
