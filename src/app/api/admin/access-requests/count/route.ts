import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { countNewAccessRequests } from "@/server/access-requests";

export async function GET() {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  return NextResponse.json({ new: await countNewAccessRequests() });
}
