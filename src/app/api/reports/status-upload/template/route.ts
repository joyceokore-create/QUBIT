import { requireSession } from "@/lib/api-guard";
import { buildStatusTemplate } from "@/server/status-report-upload";

// GET /api/reports/status-upload/template — this week's Excel template for the viewer's
// projects, prefilled from QUBIT (codes, current gates, channel states, this week's draft)
// so the upload reads back exactly. Read-only; the same projects the upload may fill.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const { fileName, xlsx } = await buildStatusTemplate(guard.ctx);
  return new Response(new Uint8Array(xlsx), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${fileName}"`,
      "content-length": String(xlsx.length),
      "cache-control": "no-store",
    },
  });
}
