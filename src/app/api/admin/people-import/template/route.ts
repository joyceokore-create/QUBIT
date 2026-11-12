import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { PEOPLE_IMPORT_TEMPLATE } from "@/lib/people-csv";

// GET /api/admin/people-import/template — the CSV people download, fill in Excel and
// upload back. BOM so Excel reads it as UTF-8; the rows are synthetic placeholders.
export async function GET() {
  const guard = await requirePermission("users:invite");
  if ("response" in guard) return guard.response;
  return new NextResponse(`﻿${PEOPLE_IMPORT_TEMPLATE}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="qubit-people-import-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
