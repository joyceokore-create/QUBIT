import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { parsePeopleCsv } from "@/lib/people-csv";
import { importPeople, PeopleImportError, previewImport } from "@/server/people-import";

// Bulk invite from the `name,email,role,projects,group` template (DM1.72 — relocated from
// the retired org-setup wizard; Oct 2026 — projects column + dry run). Parsing happens
// BEFORE anything touches the database, so the caller can preview valid/invalid rows, and
// a bad line never aborts the batch. `?dryRun=1` returns the preview and writes nothing.
const Body = z.object({ csv: z.string().min(1).max(200_000) });

export async function POST(req: Request) {
  const guard = await requirePermission("users:invite");
  if ("response" in guard) return guard.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Paste or upload the CSV first." } }, { status: 400 });
  }
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const { rows, errors } = parsePeopleCsv(parsed.data.csv);
  try {
    if (dryRun) {
      const preview = rows.length ? await previewImport(guard.ctx, rows) : [];
      return NextResponse.json({ data: { preview, errors } });
    }
    const results = rows.length ? await importPeople(guard.ctx, rows) : [];
    return NextResponse.json({ data: { results, errors } });
  } catch (e) {
    if (e instanceof PeopleImportError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === "FORBIDDEN" ? 403 : 400 });
    }
    throw e;
  }
}
