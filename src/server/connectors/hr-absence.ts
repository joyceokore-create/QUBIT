import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { ABSENCE_TYPES, type AbsenceType } from "@/server/absence";

/**
 * HR absence adapter (docs/16 §5). Three modes in order of availability:
 *   1. manual entry — ships in M6-A, zero dependencies
 *   2. **file bridge — this module**: a CSV export from any ERP, no API call needed
 *   3. API pull — a scheduled read-only sync once the ERP endpoint exists
 *
 * The ERP stays the system of record: rows land with `source="import"` and carry their
 * `externalRef`, so a re-import updates rather than duplicates, and nothing here ever
 * writes back to the HR system.
 */

export interface CsvAbsenceRow {
  email: string;
  type: AbsenceType;
  startDate: Date;
  endDate: Date;
  externalRef: string | null;
}

export interface CsvParseResult {
  rows: CsvAbsenceRow[];
  /** Rows that could not be read, with the reason — reported, never silently dropped. */
  rejected: { line: number; reason: string }[];
}

const HEADER = ["email", "type", "start", "end", "ref"];

/**
 * Parse a leave export: `email,type,start,end[,ref]`, with or without a header row.
 * Pure so the parsing rules are unit-testable. A bad row is REJECTED WITH A REASON and
 * the rest still import — one malformed line must not cost you the whole file.
 */
export function parseAbsenceCsv(text: string): CsvParseResult {
  const rows: CsvAbsenceRow[] = [];
  const rejected: { line: number; reason: string }[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cells = line.split(",").map((c) => c.trim());
    // Skip a header row, however it is cased.
    if (i === 0 && cells[0]?.toLowerCase() === HEADER[0]) return;

    const [email, type, start, end, ref] = cells;
    const lineNo = i + 1;
    if (!email || !email.includes("@")) {
      rejected.push({ line: lineNo, reason: "no email address" });
      return;
    }
    if (!type || !(ABSENCE_TYPES as readonly string[]).includes(type)) {
      rejected.push({ line: lineNo, reason: `unknown type "${type ?? ""}"` });
      return;
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      rejected.push({ line: lineNo, reason: "unreadable date" });
      return;
    }
    if (endDate < startDate) {
      rejected.push({ line: lineNo, reason: "ends before it starts" });
      return;
    }
    rows.push({ email, type: type as AbsenceType, startDate, endDate, externalRef: ref || null });
  });

  return { rows, rejected };
}

export interface ImportResult {
  created: number;
  updated: number;
  /** Rows naming somebody this tenant doesn't have — surfaced, not swallowed. */
  unknownPeople: string[];
  rejected: { line: number; reason: string }[];
}

/** Import a parsed leave export. Idempotent on `externalRef` when one is supplied. */
export async function importAbsenceCsv(ctx: TenantContext, text: string): Promise<ImportResult> {
  const { rows, rejected } = parseAbsenceCsv(text);
  const unknownPeople: string[] = [];
  let created = 0;
  let updated = 0;

  await withTenant(ctx, async (tx) => {
    const emails = [...new Set(rows.map((r) => r.email.toLowerCase()))];
    const users = emails.length
      ? await tx.user.findMany({ where: { email: { in: emails, mode: "insensitive" } }, select: { id: true, email: true } })
      : [];
    const idByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));

    for (const row of rows) {
      const userId = idByEmail.get(row.email.toLowerCase());
      if (!userId) {
        if (!unknownPeople.includes(row.email)) unknownPeople.push(row.email);
        continue;
      }
      // Idempotency: the same externalRef updates in place, so re-running an export
      // corrects dates instead of stacking duplicates.
      const existing = row.externalRef
        ? await tx.absence.findFirst({ where: { userId, externalRef: row.externalRef }, select: { id: true } })
        : null;
      if (existing) {
        await tx.absence.update({
          where: { id: existing.id },
          data: { type: row.type, startDate: row.startDate, endDate: row.endDate },
        });
        updated++;
      } else {
        await tx.absence.create({
          data: {
            tenantId: ctx.tenantId,
            userId,
            type: row.type,
            startDate: row.startDate,
            endDate: row.endDate,
            source: "import",
            externalRef: row.externalRef,
            createdById: ctx.userId,
          },
        });
        created++;
      }
    }

    await audit(tx, ctx, {
      action: "create",
      entityType: "absence_import",
      entityId: ctx.tenantId,
      after: { created, updated, rejected: rejected.length, unknownPeople: unknownPeople.length },
    });
  });

  return { created, updated, unknownPeople, rejected };
}
