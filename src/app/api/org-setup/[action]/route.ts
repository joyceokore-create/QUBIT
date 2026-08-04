import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { parsePeopleCsv } from "@/lib/people-csv";
import {
  BrandInput,
  completeSetup,
  ensureDefaultTemplates,
  importPeople,
  OrgSetupError,
  seedDepartments,
  seedMarkets,
  updateBrand,
} from "@/server/org-setup";

// M-P1e (docs/31 §4) — one route per wizard step, all Super-Admin (iam:manage).
// The engine re-checks the same gate, so neither layer can be skipped alone.

const MarketsInput = z.object({ codes: z.array(z.string().max(5)).min(1).max(10) });
const DepartmentsInput = z.object({ names: z.array(z.string().max(80)).max(30) });
const ImportInput = z.object({ csv: z.string().max(200_000) });

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  const { action } = await params;
  const body = await req.json().catch(() => null);

  const bad = (message: string) =>
    NextResponse.json({ error: { code: "VALIDATION", message } }, { status: 400 });

  try {
    switch (action) {
      case "brand": {
        const parsed = BrandInput.safeParse(body);
        if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid colours.");
        return NextResponse.json(await updateBrand(guard.ctx, parsed.data));
      }
      case "markets": {
        const parsed = MarketsInput.safeParse(body);
        if (!parsed.success) return bad("Pick at least one market.");
        return NextResponse.json(await seedMarkets(guard.ctx, parsed.data.codes));
      }
      case "departments": {
        const parsed = DepartmentsInput.safeParse(body);
        if (!parsed.success) return bad("Invalid department list.");
        return NextResponse.json(await seedDepartments(guard.ctx, parsed.data.names));
      }
      case "templates":
        return NextResponse.json(await ensureDefaultTemplates(guard.ctx));
      case "import": {
        const parsed = ImportInput.safeParse(body);
        if (!parsed.success) return bad("Invalid CSV payload.");
        const { rows, errors } = parsePeopleCsv(parsed.data.csv);
        const results = await importPeople(guard.ctx, rows);
        return NextResponse.json({ results, parseErrors: errors });
      }
      case "complete":
        return NextResponse.json(await completeSetup(guard.ctx));
      default:
        return NextResponse.json({ error: { code: "NOT_FOUND", message: "Unknown step." } }, { status: 404 });
    }
  } catch (e) {
    if (e instanceof OrgSetupError) {
      const status = e.code === "FORBIDDEN" ? 403 : 400;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    }
    throw e;
  }
}
